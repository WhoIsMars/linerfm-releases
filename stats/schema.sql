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

-- Accessi all'app, scritti dal worker licenze (linerfm/worker/src/access.ts).
-- Della chiave solo gli ultimi 4 caratteri, del Mac i primi 8 dell'hash.
CREATE TABLE IF NOT EXISTS access (
  ts INTEGER NOT NULL,      -- epoch ms, UTC
  kind TEXT NOT NULL,       -- trial | activate | validate | deactivate | reset | sale | refund | disabled
  outcome TEXT NOT NULL,    -- new | active | expired | ok | refused
  reason TEXT NOT NULL,
  device TEXT NOT NULL,
  key TEXT NOT NULL,
  country TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS access_ts ON access (ts);
