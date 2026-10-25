#!/usr/bin/env node
// Email lasciate dal sito da telefono (tabella leads, POST /lead). Dal 25/10 il link parte da solo
// con Resend (src/lead.ts); qui restano solo gli indirizzi dove non è partito (sent_ts NULL), da
// mandare a mano da hello@linerfm.xyz o dalla Gmail.
//
//   node scripts/leads.mjs                  elenco degli ultimi 7 giorni, con un link mailto: pronto per ognuna
//   node scripts/leads.mjs --days 1         solo l'ultimo giorno
//   node scripts/leads.mjs --discord        manda l'elenco su Discord (~/LinerFM-Social/bin/notify.mjs text)
//   node scripts/leads.mjs --discord --dry-run   stampa quello che manderebbe
//
// Legge il D1 remoto in sola lettura con wrangler (serve il login Cloudflare di questo Mac).
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DOWNLOAD = "https://linerfm.xyz/?src=email#download";
export const SUBJECT = "Your LinerFM download link";
export const BODY = `Hi,

here is the link to download LinerFM on your Mac or PC:
${DOWNLOAD}

It's free for 5 days, no card and no account. Open it on your computer and pick Mac or Windows.

LinerFM`;

const ROME = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const rome = (ts) => ROME.format(new Date(ts)).replace(",", "");

export function digest(rows) {
  if (!rows.length) return "Nessuna email da telefono nel periodo";
  const lines = rows.map((r) => `${rome(r.ts)} · ${r.email} · ${r.src || "diretto"} · ${r.country || "?"}`);
  return [`${rows.length} email da telefono da mandare`, ...lines, "", "Link per ognuna: node scripts/leads.mjs nella cartella stats"].join("\n");
}

export function mailto(email) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;
}

export function unsentQuery(since) {
  return `SELECT ts, email, src, country FROM leads WHERE ts > ${Math.floor(since)} AND sent_ts IS NULL ORDER BY ts`;
}

function readLeads(days) {
  const since = Date.now() - days * 86_400_000;
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "linerfm-site-stats", "--remote", "--json",
    "--command", unsentQuery(since)],
    { cwd: join(dirname(fileURLToPath(import.meta.url)), ".."), encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(out)[0]?.results ?? [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--days");
  const days = i >= 0 ? Number(argv[i + 1]) : 7;
  const rows = readLeads(days);
  if (argv.includes("--discord")) {
    const args = [join(homedir(), "LinerFM-Social/bin/notify.mjs"), "text", ...(argv.includes("--dry-run") ? ["--dry-run"] : [])];
    execFileSync("node", args, { input: digest(rows), stdio: ["pipe", "inherit", "inherit"] });
  } else {
    console.log(digest(rows));
    for (const r of rows) console.log(`\n${r.email}\n${mailto(r.email)}`);
  }
}
