-- Cloudflare D1 schema for Google Ads Report Monitor

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL,
  file_key TEXT NOT NULL,
  account_count INTEGER NOT NULL DEFAULT 0,
  campaign_count INTEGER NOT NULL DEFAULT 0,
  missing_accounts INTEGER NOT NULL DEFAULT 0,
  new_campaigns INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error TEXT,
  details TEXT
);

CREATE TABLE IF NOT EXISTS file_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_key TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  snapshot_hash TEXT,
  account_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_logs_checked_at ON logs(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_history_timestamp ON file_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_file_history_file_key ON file_history(file_key);

INSERT OR IGNORE INTO users (username) VALUES ('Black7777');
