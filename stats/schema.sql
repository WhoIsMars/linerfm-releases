-- npx wrangler d1 execute linerfm-site-stats --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS hits (
  ts INTEGER NOT NULL,      -- epoch ms, UTC
  kind TEXT NOT NULL,       -- view | download
  path TEXT NOT NULL,
  ref TEXT NOT NULL,        -- referrer host only, '' when direct or internal
  src TEXT NOT NULL,        -- ?src= / ?utm_source= tag, kept for the whole tab session
  arch TEXT NOT NULL,       -- downloads: apple-silicon | intel | github-page
  sid TEXT NOT NULL,        -- random per-tab id, joins a visit to its download
  country TEXT NOT NULL     -- Cloudflare's country guess; the IP itself is never stored
);
CREATE INDEX IF NOT EXISTS hits_ts ON hits (ts);
