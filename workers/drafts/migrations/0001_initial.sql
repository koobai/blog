CREATE TABLE IF NOT EXISTS laodao_drafts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  location_name TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_laodao_drafts_created_at
  ON laodao_drafts(created_at DESC);
