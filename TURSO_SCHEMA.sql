-- Turso SQLite Database Schema for Gmail Diary Vault

CREATE TABLE IF NOT EXISTS journal_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,
  raw_subject TEXT,
  sender TEXT,
  entries TEXT NOT NULL, -- Serialized JSON array: [{ day, text, image, imageFilename }]
  total_entries INTEGER DEFAULT 7,
  image_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by slug in the Dynamic Viewer (/week/[slug])
CREATE INDEX IF NOT EXISTS idx_journal_weeks_slug ON journal_weeks(slug);

-- Index for sorting newest weeks first in the Index Vault (/)
CREATE INDEX IF NOT EXISTS idx_journal_weeks_published_at ON journal_weeks(published_at DESC);
