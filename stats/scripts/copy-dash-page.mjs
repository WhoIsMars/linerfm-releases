// Copia la pagina di casa dell'owner (~/LinerFM-Social/review/index.html) in src/dash/page.ts:
// /dashboard online serve la stessa pagina. Si rilancia quando cambia index.html, prima di deploy e test.
//   node scripts/copy-dash-page.mjs [percorso di index.html]
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const src = process.argv[2] || join(homedir(), "LinerFM-Social/review/index.html");
const html = readFileSync(src, "utf8");
const sha = createHash("sha256").update(html).digest("hex").slice(0, 12);
const out = new URL("../src/dash/page.ts", import.meta.url);
writeFileSync(out, `// GENERATO da scripts/copy-dash-page.mjs da ${src.replace(homedir(), "~")} (sha256 ${sha}): non modificare a mano.\nexport const PAGE = ${JSON.stringify(html)};\n`);
console.log(`scritto src/dash/page.ts (${html.length} caratteri, ${sha})`);
