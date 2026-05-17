const CONFIG_KEYS = {
  BASELINE_ACCOUNT: 'baseline_account_key',
  BASELINE_CAMPAIGN: 'baseline_campaign_key',
  COL_CUSTOMER_ID: 'col_customer_id',
  COL_ACCOUNT_NAME: 'col_account_name',
  COL_CAMPAIGN_NAME: 'col_campaign_name',
};

export async function getConfig(db, key) {
  const row = await db.prepare('SELECT value FROM configs WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

export async function getAllConfig(db) {
  const { results } = await db.prepare('SELECT key, value, updated_at FROM configs').all();
  const map = {};
  for (const r of results || []) map[r.key] = { value: r.value, updatedAt: r.updated_at };
  return map;
}

export async function setConfig(db, key, value) {
  await db
    .prepare(
      `INSERT INTO configs (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, value)
    .run();
}

export async function insertLog(db, entry) {
  await db
    .prepare(
      `INSERT INTO logs (checked_at, file_key, account_count, campaign_count, missing_accounts, new_campaigns, status, error, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      entry.checkedAt,
      entry.fileKey,
      entry.accountCount,
      entry.campaignCount,
      entry.missingAccounts,
      entry.newCampaigns,
      entry.status,
      entry.error ?? null,
      entry.details ? JSON.stringify(entry.details) : null
    )
    .run();
}

export async function getLogs(db, limit = 100) {
  const { results } = await db
    .prepare(
      `SELECT id, checked_at, file_key, account_count, campaign_count, missing_accounts, new_campaigns, status, error
       FROM logs ORDER BY checked_at DESC LIMIT ?`
    )
    .bind(limit)
    .all();
  return results || [];
}

export async function insertFileHistory(db, fileKey, timestamp, snapshotHash, accountCount) {
  await db
    .prepare(
      `INSERT INTO file_history (file_key, timestamp, snapshot_hash, account_count) VALUES (?, ?, ?, ?)`
    )
    .bind(fileKey, timestamp, snapshotHash, accountCount)
    .run();
}

/** Most recent processed file before this check (last file that may still contain the account). */
export async function findLastValidFileKey(db, _kv, _customerId, beforeTimestamp) {
  const { results } = await db
    .prepare(
      `SELECT file_key FROM file_history
       WHERE timestamp < ? ORDER BY timestamp DESC LIMIT 1`
    )
    .bind(beforeTimestamp)
    .all();
  if (results?.[0]) return results[0].file_key;

  const fallback = await db
    .prepare(`SELECT file_key FROM file_history ORDER BY timestamp DESC LIMIT 1`)
    .first();
  return fallback?.file_key ?? 'unknown';
}

export async function getDashboardStats(db) {
  const latest = await db
    .prepare(
      `SELECT checked_at, file_key, account_count, campaign_count, missing_accounts, new_campaigns, status
       FROM logs ORDER BY checked_at DESC LIMIT 1`
    )
    .first();

  const totals = await db
    .prepare(
      `SELECT
         COUNT(*) as total_checks,
         COALESCE(SUM(missing_accounts), 0) as total_missing,
         COALESCE(SUM(new_campaigns), 0) as total_new_campaigns
       FROM logs WHERE status = 'success'`
    )
    .first();

  const fileCount = await db.prepare('SELECT COUNT(*) as c FROM file_history').first();

  return { latest, totals, fileCount: fileCount?.c ?? 0 };
}

export { CONFIG_KEYS };
