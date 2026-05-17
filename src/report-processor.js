import { loadR2Xlsx } from './xlsx.js';
import {
  computeSnapshotHash,
  serializeAccounts,
  serializeCampaigns,
  deserializeAccounts,
  deserializeCampaigns,
} from './snapshot.js';
import { findMissingAccounts, findNewCampaigns, filterNewAlerts } from './compare.js';
import {
  getConfig,
  setConfig,
  insertLog,
  insertFileHistory,
  findLastValidFileKey,
  CONFIG_KEYS,
} from './db.js';
import { isTelegramConfigured } from './telegram.js';

const KV_HASH = 'latest_snapshot_hash';
const KV_ACCOUNTS = 'latest_accounts';
const KV_CAMPAIGNS = 'latest_campaigns';
const KV_BASELINE_ACCOUNTS = 'baseline_accounts';
const KV_BASELINE_CAMPAIGNS = 'baseline_campaigns';

async function loadBaselineAccounts(env) {
  const cached = await env.KV.get(KV_BASELINE_ACCOUNTS);
  if (cached) return deserializeAccounts(cached);

  const key = await getConfig(env.DB, CONFIG_KEYS.BASELINE_ACCOUNT);
  if (!key) return new Map();
  const { accounts } = await loadR2Xlsx(env.R2, key);
  await env.KV.put(KV_BASELINE_ACCOUNTS, serializeAccounts(accounts));
  return accounts;
}

async function loadBaselineCampaigns(env) {
  const cached = await env.KV.get(KV_BASELINE_CAMPAIGNS);
  if (cached) return deserializeCampaigns(cached);

  const key = await getConfig(env.DB, CONFIG_KEYS.BASELINE_CAMPAIGN);
  if (!key) return new Map();
  const { campaigns } = await loadR2Xlsx(env.R2, key);
  await env.KV.put(KV_BASELINE_CAMPAIGNS, serializeCampaigns(campaigns));
  return campaigns;
}

async function enqueueAlerts(env, alerts) {
  const jobs = [];
  for (const a of alerts.missing) {
    jobs.push(
      env.ALERT_QUEUE.send({
        type: 'missing_account',
        customerId: a.customerId,
        accountName: a.accountName,
        lastValidFileKey: a.lastValidFileKey,
        timestamp: a.timestamp,
      })
    );
  }
  for (const c of alerts.campaigns) {
    jobs.push(
      env.ALERT_QUEUE.send({
        type: 'new_campaign',
        customerId: c.customerId,
        accountName: c.accountName,
        campaignName: c.campaignName,
        fileKey: c.fileKey,
        timestamp: c.timestamp,
      })
    );
  }
  await Promise.all(jobs);
}

export async function processReport(env, fileKey) {
  const checkedAt = new Date().toISOString();

  try {
    const { accounts, campaigns } = await loadR2Xlsx(env.R2, fileKey);
    const accountCount = accounts.size;
    const campaignCount = campaigns.size;

    const hash = await computeSnapshotHash(accounts, campaigns);
    const prevHash = await env.KV.get(KV_HASH);

    if (prevHash === hash) {
      await insertLog(env.DB, {
        checkedAt,
        fileKey,
        accountCount,
        campaignCount,
        missingAccounts: 0,
        newCampaigns: 0,
        status: 'skipped',
        details: { reason: 'identical_snapshot_hash' },
      });
      return { ok: true, skipped: true, hash };
    }

    const baselineAccounts = await loadBaselineAccounts(env);
    const baselineCampaigns = await loadBaselineCampaigns(env);

    const missingRaw = findMissingAccounts(baselineAccounts, accounts);
    const newCampaignsRaw = findNewCampaigns(baselineCampaigns, campaigns);

    const { toAlertMissing, toAlertCampaigns } = await filterNewAlerts(
      env.KV,
      missingRaw,
      newCampaignsRaw
    );

    const telegramReady = isTelegramConfigured(env);
    const missingWithMeta = [];
    for (const a of toAlertMissing) {
      const lastValidFileKey = await findLastValidFileKey(env.DB, env.KV, a.customerId, checkedAt);
      missingWithMeta.push({
        ...a,
        lastValidFileKey,
        timestamp: checkedAt,
      });
    }

    const campaignsWithMeta = toAlertCampaigns.map((c) => ({
      ...c,
      fileKey,
      timestamp: checkedAt,
    }));

    if (telegramReady && (missingWithMeta.length || campaignsWithMeta.length)) {
      await enqueueAlerts(env, {
        missing: missingWithMeta,
        campaigns: campaignsWithMeta,
      });
    }

    await env.KV.put(KV_HASH, hash);
    await env.KV.put(KV_ACCOUNTS, serializeAccounts(accounts));
    await env.KV.put(KV_CAMPAIGNS, serializeCampaigns(campaigns));

    await insertFileHistory(env.DB, fileKey, checkedAt, hash, accountCount);

    await insertLog(env.DB, {
      checkedAt,
      fileKey,
      accountCount,
      campaignCount,
      missingAccounts: missingRaw.length,
      newCampaigns: newCampaignsRaw.length,
      status: 'success',
      details: {
        alertedMissing: missingWithMeta.length,
        alertedCampaigns: campaignsWithMeta.length,
        hash,
      },
    });

    return {
      ok: true,
      skipped: false,
      hash,
      accountCount,
      campaignCount,
      missingAccounts: missingRaw.length,
      newCampaigns: newCampaignsRaw.length,
      alertedMissing: missingWithMeta.length,
      alertedCampaigns: campaignsWithMeta.length,
    };
  } catch (err) {
    await insertLog(env.DB, {
      checkedAt,
      fileKey,
      accountCount: 0,
      campaignCount: 0,
      missingAccounts: 0,
      newCampaigns: 0,
      status: 'error',
      error: err.message,
    });
    throw err;
  }
}

export async function refreshBaselineCache(env, type, r2Key) {
  const { accounts, campaigns } = await loadR2Xlsx(env.R2, r2Key);
  if (type === 'account') {
    await env.KV.put(KV_BASELINE_ACCOUNTS, serializeAccounts(accounts));
    await setConfig(env.DB, CONFIG_KEYS.BASELINE_ACCOUNT, r2Key);
  } else {
    await env.KV.put(KV_BASELINE_CAMPAIGNS, serializeCampaigns(campaigns));
    await setConfig(env.DB, CONFIG_KEYS.BASELINE_CAMPAIGN, r2Key);
  }
}
