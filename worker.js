import {
  login,
  requireAdmin,
  sessionCookie,
  clearSessionCookie,
} from './src/auth.js';
import {
  getAllConfig,
  getConfig,
  setConfig,
  getLogs,
  getDashboardStats,
  CONFIG_KEYS,
} from './src/db.js';
import { processReport, refreshBaselineCache } from './src/report-processor.js';
import { processQueueMessage } from './src/notify.js';
import { isTelegramConfigured, getTelegramChatId, DEFAULT_TELEGRAM_GROUP_NAME } from './src/telegram.js';
import { DEFAULTS as COLUMN_DEFAULTS } from './src/column-config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extraHeaders },
  });
}

function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function isSecure(request) {
  const url = new URL(request.url);
  return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

async function parseBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    return request.json();
  }
  if (ct.includes('multipart/form-data')) {
    return request.formData();
  }
  return null;
}

async function uploadToR2(r2, key, file) {
  const buffer = await file.arrayBuffer();
  await r2.put(key, buffer, {
    httpMetadata: {
      contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
  return key;
}

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const secure = isSecure(request);

  if (method === 'OPTIONS' && (path === '/api/tool/upload' || path === '/api/report')) {
    return corsPreflight();
  }

  // --- Tool: upload XLSX + xử lý (1 request) ---
  if (path === '/api/tool/upload' && method === 'POST') {
    const form = await parseBody(request);
    if (!form || !(form instanceof FormData)) {
      return json({ error: 'Expected multipart: secret, file[, file_key]' }, 400);
    }
    const secret = form.get('secret');
    if (secret !== env.WEBHOOK_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return json({ error: 'Missing file' }, 400);
    }
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultKey = `reports/${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}/report_${pad(now.getHours())}_${pad(now.getMinutes())}.xlsx`;
    const fileKey = (form.get('file_key') && String(form.get('file_key'))) || defaultKey;
    await uploadToR2(env.R2, fileKey, file);
    ctx.waitUntil(
      processReport(env, fileKey).catch((e) => console.error('processReport', e))
    );
    return json({ ok: true, file_key: fileKey, message: 'Uploaded and queued for processing' });
  }

  // --- Public webhook (tool đã upload R2 trước) ---
  if (path === '/api/report' && method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.file_key || body.secret !== env.WEBHOOK_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }
    ctx.waitUntil(
      processReport(env, body.file_key).catch((e) => console.error('processReport', e))
    );
    return json({ ok: true, message: 'Report queued for processing' });
  }

  // --- Auth ---
  if (path === '/api/login' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await login(env, body.username, body.password);
    if (!result.ok) return json({ error: result.error }, 401);
    return json(
      { ok: true, user: 'Black7777' },
      200,
      { 'Set-Cookie': sessionCookie(result.token, secure) }
    );
  }

  if (path === '/api/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(secure) });
  }

  if (path === '/api/me' && method === 'GET') {
    const admin = await requireAdmin(env, request);
    if (!admin) return json({ error: 'Unauthorized' }, 401);
    return json({ ok: true, user: admin.sub });
  }

  // --- Protected routes ---
  const admin = await requireAdmin(env, request);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  if (path === '/api/dashboard' && method === 'GET') {
    const stats = await getDashboardStats(env.DB);
    const hash = await env.KV.get('latest_snapshot_hash');
    return json({ stats, latestHash: hash });
  }

  if (path === '/api/config' && method === 'GET') {
    const configs = await getAllConfig(env.DB);
    return json({
      configs,
      columns: {
        defaults: COLUMN_DEFAULTS,
        customerId: configs?.col_customer_id?.value || COLUMN_DEFAULTS.customerId,
        accountName: configs?.col_account_name?.value || COLUMN_DEFAULTS.accountName,
        campaignName: configs?.col_campaign_name?.value || COLUMN_DEFAULTS.campaignName,
      },
      telegram: {
        groupName: DEFAULT_TELEGRAM_GROUP_NAME,
        chatId: getTelegramChatId(env),
        configured: isTelegramConfigured(env),
      },
    });
  }

  if (path === '/api/config' && method === 'POST') {
    const body = await request.json().catch(() => ({}));

    if (body.baseline_account_key) {
      await setConfig(env.DB, CONFIG_KEYS.BASELINE_ACCOUNT, body.baseline_account_key);
      await env.KV.delete('baseline_accounts');
    }
    if (body.baseline_campaign_key) {
      await setConfig(env.DB, CONFIG_KEYS.BASELINE_CAMPAIGN, body.baseline_campaign_key);
      await env.KV.delete('baseline_campaigns');
    }
    if (body.col_customer_id != null) {
      await setConfig(env.DB, CONFIG_KEYS.COL_CUSTOMER_ID, String(body.col_customer_id).trim());
    }
    if (body.col_account_name != null) {
      await setConfig(env.DB, CONFIG_KEYS.COL_ACCOUNT_NAME, String(body.col_account_name).trim());
    }
    if (body.col_campaign_name != null) {
      await setConfig(env.DB, CONFIG_KEYS.COL_CAMPAIGN_NAME, String(body.col_campaign_name).trim());
    }
    if (body.col_customer_id != null || body.col_account_name != null || body.col_campaign_name != null) {
      await env.KV.delete('baseline_accounts');
      await env.KV.delete('baseline_campaigns');
    }

    return json({ ok: true });
  }

  if (path === '/api/config/upload' && method === 'POST') {
    const form = await parseBody(request);
    if (!form || !(form instanceof FormData)) {
      return json({ error: 'Expected multipart form' }, 400);
    }

    const type = form.get('type'); // account | campaign
    const file = form.get('file');
    const customKey = form.get('file_key');

    const defaultName = type === 'campaign' ? 'baseline_campaign.xlsx' : 'baseline_account.xlsx';
    let key = customKey || `baseline/${defaultName}`;

    if (file && typeof file !== 'string') {
      await uploadToR2(env.R2, key, file);
    } else if (!customKey) {
      return json({ error: 'Missing file or R2 key' }, 400);
    }

    if (type === 'campaign') {
      await setConfig(env.DB, CONFIG_KEYS.BASELINE_CAMPAIGN, key);
      await refreshBaselineCache(env, 'campaign', key);
    } else {
      await setConfig(env.DB, CONFIG_KEYS.BASELINE_ACCOUNT, key);
      await refreshBaselineCache(env, 'account', key);
    }

    return json({ ok: true, file_key: key });
  }

  if (path === '/api/report/upload' && method === 'POST') {
    const form = await parseBody(request);
    if (!form || !(form instanceof FormData)) {
      return json({ error: 'Expected multipart: file' }, 400);
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return json({ error: 'Missing file' }, 400);
    }
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultKey = `reports/${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}/report_${pad(now.getHours())}_${pad(now.getMinutes())}.xlsx`;
    const fileKey = (form.get('file_key') && String(form.get('file_key'))) || defaultKey;
    await uploadToR2(env.R2, fileKey, file);
    ctx.waitUntil(
      processReport(env, fileKey).catch((e) => console.error('processReport', e))
    );
    return json({ ok: true, file_key: fileKey, message: 'Uploaded and queued for processing' });
  }

  if (path === '/api/logs' && method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const logs = await getLogs(env.DB, Math.min(limit, 500));
    return json({ logs });
  }

  return json({ error: 'Not found' }, 404);
}

async function serveStatic(request, env) {
  const url = new URL(request.url);
  let path = url.pathname;

  if (path === '/') path = '/index.html';
  if (path === '/dashboard') path = '/dashboard.html';

  const assetPath = path.startsWith('/') ? path.slice(1) : path;
  const assetUrl = new URL(assetPath, request.url);
  const res = await env.ASSETS.fetch(new Request(assetUrl, request));

  if (res.status === 404 && !path.endsWith('.html')) {
    return env.ASSETS.fetch(new Request(new URL('index.html', request.url), request));
  }
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx);
      } catch (e) {
        console.error(e);
        return json({ error: e.message || 'Internal error' }, 500);
      }
    }

    return serveStatic(request, env);
  },

  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        await processQueueMessage(env, msg.body);
        msg.ack();
      } catch (e) {
        console.error('Queue consumer error:', e);
        msg.retry();
      }
    }
  },
};
