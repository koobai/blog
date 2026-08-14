CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(url, ip_hash)
);

CREATE TABLE IF NOT EXISTS likes_count (
  url TEXT PRIMARY KEY,
  total_count INTEGER NOT NULL DEFAULT 0 CHECK(total_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_likes_url ON likes(url);
