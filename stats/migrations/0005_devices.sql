-- Una riga per computer: l'ultima foto di chi è, scritta dal worker licenze a ogni controllo
-- riuscito (linerfm/worker/src/devices.ts upsertDevice) e letta dalla scheda Utenti.
-- npx wrangler d1 execute linerfm-site-stats --remote --file=migrations/0005_devices.sql
-- Niente email, niente IP. Il worker la tiene identica in worker/test/sqlite-d1.ts.
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
