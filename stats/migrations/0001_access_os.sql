-- Sistema dell'app che ha chiesto la prova o la licenza (macos | windows), scritto dal worker
-- licenze da quando l'app lo manda (linerfm/worker/src/access.ts). Le righe vecchie restano con ''.
-- Una volta sola, PRIMA del deploy del worker che lo scrive:
-- npx wrangler d1 execute linerfm-site-stats --remote --file=migrations/0001_access_os.sql
ALTER TABLE access ADD COLUMN os TEXT NOT NULL DEFAULT '';
