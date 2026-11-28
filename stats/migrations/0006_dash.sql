-- Dashboard online (/dashboard), dal 28/11/2026: la pagina di casa dell'owner (~/LinerFM-Social/review) anche fuori casa.
-- npx wrangler d1 execute linerfm-site-stats --remote --file=migrations/0006_dash.sql

-- Quello che vive sul Mac (calendario, montaggi, decisioni, feedback.jsonl...), spinto ogni 10 minuti
-- da review/push.py con DASH_SYNC_SECRET. Una riga per pezzo, sovrascritta a ogni spinta.
CREATE TABLE IF NOT EXISTS dash_snapshot (
  name TEXT PRIMARY KEY,        -- items | unlinked | montaggio | published | decisions | feedback | local | discord
  ts INTEGER NOT NULL,          -- epoch ms della spinta
  json TEXT NOT NULL
);

-- Voti, note, decisioni e scelte fatte dalla pagina online: la riga è già nel formato di feedback.jsonl
-- (fid, ts di Roma con offset). push.py le aggiunge a feedback.jsonl (senza doppioni, per fid) e poi le segna.
CREATE TABLE IF NOT EXISTS dash_actions (
  fid TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,          -- epoch ms
  row TEXT NOT NULL,            -- JSON della riga di feedback.jsonl
  synced INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS dash_actions_synced ON dash_actions (synced, ts);
