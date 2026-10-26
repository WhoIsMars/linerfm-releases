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

-- Una riga per computer, scritta dal worker licenze (linerfm/worker/src/devices.ts) e letta dalla
-- scheda Utenti. Su un D1 esistente arriva da migrations/0005_devices.sql, che ha i commenti per colonna.
CREATE TABLE IF NOT EXISTS devices (
  device TEXT PRIMARY KEY,                -- primi 8 caratteri dell'hash del computer, come in access
  first_ts INTEGER NOT NULL,              -- primo controllo visto dal server, epoch ms
  last_ts INTEGER NOT NULL,               -- ultimo controllo, epoch ms
  checks INTEGER NOT NULL DEFAULT 1,      -- controlli riusciti (uno all'ora ad app aperta)
  state TEXT NOT NULL DEFAULT '',         -- ultimo evento: trial:new | trial:active | trial:expired | validate:ok | activate:ok
  trial_day INTEGER,                      -- giorno di prova (1 = il primo), calcolato dal server
  key TEXT NOT NULL DEFAULT '',           -- ultimi 4 caratteri della licenza
  country TEXT NOT NULL DEFAULT '',       -- stima di Cloudflare
  os TEXT NOT NULL DEFAULT '',            -- macos | windows
  os_version TEXT NOT NULL DEFAULT '',    -- 26.1 | 11 24H2 (26100)
  arch TEXT NOT NULL DEFAULT '',          -- aarch64 | x86_64
  locale TEXT NOT NULL DEFAULT '',        -- lingua del sistema, it-IT
  app_version TEXT NOT NULL DEFAULT '',
  players TEXT NOT NULL DEFAULT '',       -- player visti suonare, separati da virgola
  launches INTEGER NOT NULL DEFAULT 0,    -- avvii dell'app contati sul computer
  app_first_seen INTEGER NOT NULL DEFAULT 0, -- primo avvio dichiarato dall'app, epoch ms
  discord_id TEXT NOT NULL DEFAULT '',    -- account Discord legato alla licenza
  discord_name TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS devices_last ON devices (last_ts);
