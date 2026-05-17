import * as XLSX from 'xlsx';

const COL_ALIASES = {
  customerId: ['customer id', 'customer_id', 'customerid', 'mã khách hàng'],
  accountName: ['account name', 'account_name', 'accountname', 'tên tài khoản'],
  campaignName: ['campaign name', 'campaign_name', 'campaignname', 'tên chiến dịch', 'chiến dịch'],
};

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function columnLetterToIndex(letters) {
  const s = letters.toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

function findColumnIndex(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < normalized.length; i++) {
    for (const alias of aliases) {
      if (normalized[i].includes(alias)) return i;
    }
  }
  return -1;
}

/** Cột cố định: tên header (Customer ID) hoặc chữ cái cột (A, B, D) */
function resolveColumnIndex(headers, configValue, aliases) {
  if (!configValue?.trim()) return findColumnIndex(headers, aliases);
  const v = configValue.trim();
  if (/^[A-Za-z]{1,3}$/.test(v)) {
    return columnLetterToIndex(v);
  }
  const target = normalizeHeader(v);
  const normalized = headers.map(normalizeHeader);
  const exact = normalized.indexOf(target);
  if (exact >= 0) return exact;
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i].includes(target) || target.includes(normalized[i])) return i;
  }
  return -1;
}

function sheetToMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function detectHeaderRow(rows, columnConfig) {
  const limit = Math.min(rows.length, 20);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row?.length) continue;
    const headers = row.map((c) => String(c));
    const cid = resolveColumnIndex(headers, columnConfig.customerId, COL_ALIASES.customerId);
    const acc = resolveColumnIndex(headers, columnConfig.accountName, COL_ALIASES.accountName);
    if (cid >= 0 && acc >= 0) return r;
  }
  return 0;
}

/**
 * @param {ArrayBuffer} buffer
 * @param {{ customerId: string, accountName: string, campaignName: string }} columnConfig
 */
export function parseReportBuffer(buffer, columnConfig = {}) {
  const cfg = {
    customerId: columnConfig.customerId || 'Customer ID',
    accountName: columnConfig.accountName || 'Account Name',
    campaignName: columnConfig.campaignName || 'Campaign Name',
  };

  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const accounts = new Map();
  const campaigns = new Map();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = sheetToMatrix(sheet);
    if (!rows.length) continue;

    const headerRow = detectHeaderRow(rows, cfg);
    const headers = rows[headerRow].map((c) => String(c));
    const idxCid = resolveColumnIndex(headers, cfg.customerId, COL_ALIASES.customerId);
    const idxAcc = resolveColumnIndex(headers, cfg.accountName, COL_ALIASES.accountName);
    const idxCamp = resolveColumnIndex(headers, cfg.campaignName, COL_ALIASES.campaignName);

    if (idxCid < 0 || idxAcc < 0) continue;

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const customerId = String(row[idxCid] ?? '').trim();
      const accountName = String(row[idxAcc] ?? '').trim();
      if (!customerId) continue;

      accounts.set(customerId, accountName || customerId);

      if (idxCamp >= 0) {
        const campaignName = String(row[idxCamp] ?? '').trim();
        if (campaignName) {
          const key = `${customerId}|${campaignName}`;
          campaigns.set(key, { customerId, accountName: accountName || customerId, campaignName });
        }
      }
    }
  }

  return { accounts, campaigns };
}

export async function loadR2Xlsx(r2, key, columnConfig) {
  const obj = await r2.get(key);
  if (!obj) throw new Error(`File not found in R2: ${key}`);
  const buffer = await obj.arrayBuffer();
  return parseReportBuffer(buffer, columnConfig);
}
