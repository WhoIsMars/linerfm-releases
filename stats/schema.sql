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
-- Su un D1 esistente la colonna os arriva da migrations/0001_access_os.sql.
CREATE TABLE IF NOT EXISTS access (
  ts INTEGER NOT NULL,      -- epoch ms, UTC
  kind TEXT NOT NULL,       -- trial | activate | validate | deactivate | reset | sale | refund | disabled
  outcome TEXT NOT NULL,    -- new | active | expired | ok | refused
  reason TEXT NOT NULL,
  device TEXT NOT NULL,
  key TEXT NOT NULL,
  country TEXT NOT NULL,
  os TEXT NOT NULL DEFAULT ''  -- macos | windows, '' prima della 0001 e per i client vecchi
);
CREATE INDEX IF NOT EXISTS access_ts ON access (ts);

-- Copie di risposte esterne (GitHub limita le chiamate da Cloudflare): src/admin.ts cachedJson.
CREATE TABLE IF NOT EXISTS cache (
  k TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  value TEXT NOT NULL
);

-- Righe di accesso nascoste dalla scheda Sicurezza col pulsante "Togli" (src/dashboard.ts dismiss).
CREATE TABLE IF NOT EXISTS dismissed (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL);

-- Views dei reel, una riga per lettura, scritte da ~/LinerFM-Social/bin/metrics.mjs (bin/lib/socialdb.mjs,
-- che crea anche la tabella alla prima scrittura). Le legge la scheda Social (src/admin.ts tabSocial).
CREATE TABLE IF NOT EXISTS social (
  ts INTEGER NOT NULL,      -- epoch ms, UTC, ora della lettura
  platform TEXT NOT NULL,   -- instagram | tiktok | youtube-shorts
  item TEXT NOT NULL,       -- id del calendario o del video TikTok
  title TEXT NOT NULL,
  views INTEGER NOT NULL,
  likes INTEGER NOT NULL,
  comments INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS social_ts ON social (ts);

-- Email lasciate dal sito da chi arriva col telefono, per mandargli il link del download
-- (src/lead.ts). Nessun IP: il limite per IP lo fa il binding LEAD_LIMIT di Cloudflare.
-- Su un D1 esistente arriva da migrations/0002_leads.sql. Le legge scripts/leads.mjs.
CREATE TABLE IF NOT EXISTS leads (
  ts INTEGER NOT NULL,      -- epoch ms, UTC
  email TEXT NOT NULL,      -- minuscolo, già validato
  src TEXT NOT NULL,        -- ?src= / ?utm_source= della visita, '' se manca
  country TEXT NOT NULL,    -- stima di Cloudflare
  sent_ts INTEGER           -- link partito con Resend (epoch ms); NULL = da mandare a mano. Migrazione 0004
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_email ON leads (email);
CREATE INDEX IF NOT EXISTS leads_ts ON leads (ts);
