CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  author TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT,
  content TEXT NOT NULL,
  parent_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_url_created_at
  ON comments(url, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_comments_parent_id
  ON comments(parent_id);
