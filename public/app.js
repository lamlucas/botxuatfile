async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    location.href = '/';
    throw new Error('Unauthorized');
  }
  return res;
}

async function requireAuth() {
  const res = await api('/api/me');
  if (!res.ok) location.href = '/';
}

function showPage(name) {
  document.querySelectorAll('.page').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`page-${name}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const active = btn.dataset.page === name;
    btn.classList.toggle('bg-accent/20', active);
    btn.classList.toggle('text-accent', active);
    btn.classList.toggle('text-gray-400', !active);
  });
  if (name === 'dashboard') loadDashboard();
  if (name === 'logs') loadLogs();
  if (name === 'config') loadConfig();
}

async function loadDashboard() {
  const res = await api('/api/dashboard');
  const data = await res.json();
  const t = data.stats?.totals || {};
  const latest = data.stats?.latest;

  document.getElementById('stat-checks').textContent = t.total_checks ?? 0;
  document.getElementById('stat-missing').textContent = t.total_missing ?? 0;
  document.getElementById('stat-campaigns').textContent = t.total_new_campaigns ?? 0;
  document.getElementById('stat-files').textContent = data.stats?.fileCount ?? 0;

  const el = document.getElementById('latest-check');
  if (!latest) {
    el.innerHTML = '<p>Chưa có lần check nào.</p>';
    return;
  }
  el.innerHTML = `
    <p><span class="text-gray-500">Thời gian:</span> ${latest.checked_at}</p>
    <p><span class="text-gray-500">File:</span> <code class="text-accent">${latest.file_key}</code></p>
    <p><span class="text-gray-500">Accounts:</span> ${latest.account_count} · <span class="text-gray-500">Campaigns:</span> ${latest.campaign_count}</p>
    <p><span class="text-gray-500">Account back:</span> <span class="text-red-400">${latest.missing_accounts}</span> · <span class="text-gray-500">Campaign mới:</span> <span class="text-amber-400">${latest.new_campaigns}</span></p>
    <p><span class="text-gray-500">Status:</span> ${statusBadge(latest.status)}</p>
    ${data.latestHash ? `<p><span class="text-gray-500">Snapshot hash:</span> <code class="text-xs">${data.latestHash.slice(0, 16)}…</code></p>` : ''}
  `;
}

function statusBadge(status) {
  const colors = {
    success: 'text-green-400',
    error: 'text-red-400',
    skipped: 'text-gray-400',
  };
  return `<span class="${colors[status] || 'text-gray-300'}">${status}</span>`;
}

async function loadLogs() {
  const res = await api('/api/logs?limit=200');
  const { logs } = await res.json();
  const tbody = document.getElementById('logsBody');
  if (!logs?.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">Chưa có log</td></tr>';
    return;
  }
  tbody.innerHTML = logs
    .map(
      (l) => `
    <tr class="hover:bg-surface-800/50">
      <td class="p-3 whitespace-nowrap">${l.checked_at}</td>
      <td class="p-3"><code class="text-xs text-accent break-all">${l.file_key}</code></td>
      <td class="p-3 text-right">${l.account_count}</td>
      <td class="p-3 text-right">${l.campaign_count}</td>
      <td class="p-3 text-right text-red-400">${l.missing_accounts}</td>
      <td class="p-3 text-right text-amber-400">${l.new_campaigns}</td>
      <td class="p-3">${statusBadge(l.status)}${l.error ? `<br><span class="text-red-400 text-xs">${l.error}</span>` : ''}</td>
    </tr>`
    )
    .join('');
}

async function loadConfig() {
  const res = await api('/api/config');
  const { configs, telegram } = await res.json();
  document.getElementById('keyAccount').value =
    configs?.baseline_account_key?.value || 'baseline/baseline_account.xlsx';
  document.getElementById('keyCampaign').value =
    configs?.baseline_campaign_key?.value || 'baseline/baseline_campaign.xlsx';

  const cols = data.columns || {};
  document.getElementById('colCustomerId').value = cols.customerId || 'Customer ID';
  document.getElementById('colAccountName').value = cols.accountName || 'Account Name';
  document.getElementById('colCampaignName').value = cols.campaignName || 'Campaign Name';

  const tg = document.getElementById('telegramInfo');
  if (telegram) {
    const status = telegram.configured
      ? '<span class="text-green-400">Đã cấu hình bot token</span>'
      : '<span class="text-red-400">Chưa có TELEGRAM_BOT_TOKEN</span>';
    tg.innerHTML = `
      <p><span class="text-gray-500">Nhóm:</span> ${telegram.groupName}</p>
      <p><span class="text-gray-500">Chat ID:</span> <code class="text-accent">${telegram.chatId}</code></p>
      <p>${status}</p>
    `;
  }
}

async function uploadBaseline(type) {
  const fileInput = type === 'campaign' ? document.getElementById('fileCampaign') : document.getElementById('fileAccount');
  const keyInput = type === 'campaign' ? document.getElementById('keyCampaign') : document.getElementById('keyAccount');
  const msg = document.getElementById('configMsg');

  const form = new FormData();
  form.append('type', type);
  if (fileInput.files?.[0]) {
    form.append('file', fileInput.files[0]);
  }
  if (keyInput.value) form.append('file_key', keyInput.value);

  if (!fileInput.files?.[0] && !keyInput.value) {
    showMsg(msg, 'Chọn file hoặc nhập R2 key', true);
    return;
  }

  const res = await api('/api/config/upload', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) {
    showMsg(msg, data.error || 'Upload thất bại', true);
    return;
  }
  if (type === 'account') keyInput.value = data.file_key;
  else keyInput.value = data.file_key;
  showMsg(msg, `Đã upload: ${data.file_key}`, false);
}

function showMsg(el, text, isError) {
  el.textContent = text;
  el.className = `text-sm ${isError ? 'text-red-400' : 'text-green-400'}`;
  el.classList.remove('hidden');
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

document.getElementById('btnReportUpload')?.addEventListener('click', async () => {
  const input = document.getElementById('reportUpload');
  const msg = document.getElementById('reportUploadMsg');
  const file = input?.files?.[0];
  if (!file) {
    msg.textContent = 'Chọn file .xlsx trước';
    msg.className = 'text-sm mt-3 text-red-400';
    msg.classList.remove('hidden');
    return;
  }
  msg.textContent = 'Đang upload...';
  msg.className = 'text-sm mt-3 text-gray-400';
  msg.classList.remove('hidden');
  const form = new FormData();
  form.append('file', file);
  const res = await api('/api/report/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    msg.textContent = `OK — ${data.file_key || 'đã gửi'}. Xem Logs / Telegram.`;
    msg.className = 'text-sm mt-3 text-green-400';
    loadDashboard();
  } else {
    msg.textContent = data.error || 'Upload thất bại';
    msg.className = 'text-sm mt-3 text-red-400';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.href = '/';
});

document.getElementById('uploadAccount').addEventListener('click', () => uploadBaseline('account'));
document.getElementById('uploadCampaign').addEventListener('click', () => uploadBaseline('campaign'));

document.getElementById('configForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('configMsg');
  const body = {
    baseline_account_key: document.getElementById('keyAccount').value,
    baseline_campaign_key: document.getElementById('keyCampaign').value,
    col_customer_id: document.getElementById('colCustomerId').value,
    col_account_name: document.getElementById('colAccountName').value,
    col_campaign_name: document.getElementById('colCampaignName').value,
  };
  const res = await api('/api/config', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.ok) showMsg(msg, 'Đã lưu config', false);
  else {
    const data = await res.json().catch(() => ({}));
    showMsg(msg, data.error || 'Lỗi lưu config', true);
  }
});

requireAuth().then(() => {
  const page = new URLSearchParams(location.search).get('page') || 'dashboard';
  showPage(page);
});
