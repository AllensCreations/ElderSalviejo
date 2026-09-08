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
  verse TEXT, -- Serialized JSON object: { reference, text }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by slug in the Dynamic Viewer (/week/[slug])
CREATE INDEX IF NOT EXISTS idx_journal_weeks_slug ON journal_weeks(slug);

-- Index for sorting newest weeks first in the Index Vault (/)
CREATE INDEX IF NOT EXISTS idx_journal_weeks_published_at ON journal_weeks(published_at DESC);

-- Subscribers table: Users who inserted their email to receive notification on new journals
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

-- Processed Gmail messages tracking table (replaces GAS PropertiesService storage)
CREATE TABLE IF NOT EXISTS processed_messages (
  message_id TEXT PRIMARY KEY,
  subject TEXT,
  sender TEXT,
  status TEXT DEFAULT 'processed',
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processed_messages_id ON processed_messages(message_id);

-- Weekly broadcast recipient logs (ensures each subscriber receives only one email per week)
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_slug TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(week_slug, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_logs_slug ON broadcast_logs(week_slug);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_recipient ON broadcast_logs(week_slug, recipient_email);

-- Family & Friends Notes / Encouragement Messages table
CREATE TABLE IF NOT EXISTS family_encouragements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  relationship TEXT DEFAULT 'Family & Friends',
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_family_encouragements_slug ON family_encouragements(week_slug);
