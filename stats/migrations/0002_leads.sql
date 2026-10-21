-- Tabella delle email lasciate dal sito da telefono (src/lead.ts, POST /lead).
-- Una volta sola, PRIMA del deploy del worker che la scrive:
-- npx wrangler d1 execute linerfm-site-stats --remote --file=migrations/0002_leads.sql
CREATE TABLE IF NOT EXISTS leads (
  ts INTEGER NOT NULL,
  email TEXT NOT NULL,
  src TEXT NOT NULL,
  country TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_email ON leads (email);
CREATE INDEX IF NOT EXISTS leads_ts ON leads (ts);
