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

function sheetToMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function detectHeaderRow(rows) {
  const limit = Math.min(rows.length, 20);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row?.length) continue;
    const headers = row.map((c) => String(c));
    const cid = findColumnIndex(headers, COL_ALIASES.customerId);
    const acc = findColumnIndex(headers, COL_ALIASES.accountName);
    if (cid >= 0 && acc >= 0) return r;
  }
  return 0;
}

/**
 * Parse XLSX buffer — only Customer ID, Account Name, Campaign Name.
 * @returns {{ accounts: Map<string,string>, campaigns: Map<string,{accountName:string,campaignName:string}> }}
 */
export function parseReportBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const accounts = new Map();
  const campaigns = new Map();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = sheetToMatrix(sheet);
    if (!rows.length) continue;

    const headerRow = detectHeaderRow(rows);
    const headers = rows[headerRow].map((c) => String(c));
    const idxCid = findColumnIndex(headers, COL_ALIASES.customerId);
    const idxAcc = findColumnIndex(headers, COL_ALIASES.accountName);
    const idxCamp = findColumnIndex(headers, COL_ALIASES.campaignName);

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

export async function loadR2Xlsx(r2, key) {
  const obj = await r2.get(key);
  if (!obj) throw new Error(`File not found in R2: ${key}`);
  const buffer = await obj.arrayBuffer();
  return parseReportBuffer(buffer);
}
