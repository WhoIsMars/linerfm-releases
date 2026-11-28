# linerfm-site-stats

Worker Cloudflare delle visite del sito (`/hit`, `/lead`), della dashboard dell'owner (`/dashboard`) e del riepilogo su Discord.

**Il worker si pubblica solo da `main`** (`npx wrangler deploy` da un checkout di `main`): un deploy da un altro branch riporta indietro la dashboard.

Test: `npx vitest run`, tipi: `npx tsc --noEmit`. La pagina `/dashboard` viene da `~/LinerFM-Social/review/index.html`: `node scripts/copy-dash-page.mjs` prima di test e deploy.
