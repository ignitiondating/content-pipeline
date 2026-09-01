CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  brief TEXT NOT NULL,
  model TEXT NOT NULL,
  variant_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES batches(id),
  format TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  series_id TEXT REFERENCES series(id),
  part_index INTEGER,
  part_role TEXT,
  hook_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  posted_at TEXT
);
CREATE INDEX idx_drafts_status ON drafts(status);
CREATE INDEX idx_drafts_format_created ON drafts(format, created_at DESC);
CREATE INDEX idx_drafts_series ON drafts(series_id, part_index);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  message TEXT,
  workdir TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  tag TEXT,
  duration_s REAL,
  width INTEGER,
  height INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  missing INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_assets_rotation ON assets(kind, tag, missing, use_count, last_used_at);

CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  dir TEXT NOT NULL,
  files_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
