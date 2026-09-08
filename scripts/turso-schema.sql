-- Turso SQLite Database Schema for Gmail Diary Vault

-- 1. Journal Weeks table: Dedicated weekly P-Day reflections and letters
CREATE TABLE IF NOT EXISTS journal_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,
  raw_subject TEXT,
  sender TEXT,
  entries TEXT NOT NULL, -- Serialized JSON array: [{ day, text, image, imageFilename, category }]
  total_entries INTEGER DEFAULT 7,
  image_count INTEGER DEFAULT 0,
  verse TEXT,            -- Serialized JSON object: { reference, text }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journal_weeks_slug ON journal_weeks(slug);
CREATE INDEX IF NOT EXISTS idx_journal_weeks_published_at ON journal_weeks(published_at DESC);

-- 2. Gallery table: Dedicated Polaroid photo gallery albums and direct image uploads
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,
  raw_subject TEXT,
  sender TEXT,
  category TEXT DEFAULT 'Mission',
  body_text TEXT,
  entries TEXT NOT NULL, -- Serialized JSON array: [{ day, text, caption, image, imageFilename, category }]
  total_entries INTEGER DEFAULT 0,
  image_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gallery_slug ON gallery(slug);
CREATE INDEX IF NOT EXISTS idx_gallery_published_at ON gallery(published_at DESC);

-- 3. Subscribers table: Users who subscribed to receive weekly journal email notifications
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

-- 4. Processed Gmail messages tracking table (Anti-duplicate engine)
CREATE TABLE IF NOT EXISTS processed_messages (
  message_id TEXT PRIMARY KEY,
  subject TEXT,
  sender TEXT,
  status TEXT DEFAULT 'processed',
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processed_messages_id ON processed_messages(message_id);

-- 5. Weekly broadcast recipient logs (Ensures exactly one email per subscriber per week)
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_slug TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(week_slug, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_logs_slug ON broadcast_logs(week_slug);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_recipient ON broadcast_logs(week_slug, recipient_email);

-- 6. Family & Friends Notes / Encouragement Messages table
CREATE TABLE IF NOT EXISTS family_encouragements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  relationship TEXT DEFAULT 'Family & Friends',
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_family_encouragements_slug ON family_encouragements(week_slug);
