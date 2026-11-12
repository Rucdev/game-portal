CREATE TABLE games (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  active_version TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE versions (
  game_slug TEXT NOT NULL REFERENCES games(slug) ON DELETE CASCADE,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready', 'failed')),
  godot_version TEXT,
  total_bytes INTEGER,
  file_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (game_slug, version)
);
