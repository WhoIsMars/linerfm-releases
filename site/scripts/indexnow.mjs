// Ping IndexNow dopo la pubblicazione (job "indexnow" di deploy-pages.yml).
// Uso: node scripts/indexnow.mjs [https://linerfm.xyz] [--dry-run]
import { indexNowPayload } from "../src/lib/indexnow.mjs";

const site = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "https://linerfm.xyz";
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.text(); };

// la sitemap è un indice: si seguono le sitemap figlie
const index = await get(`${site}/sitemap-index.xml`);
const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const xml = (await Promise.all(children.map(get))).join("\n");
const payload = indexNowPayload(xml, site);
if (payload.urlList.length === 0) throw new Error("sitemap senza pagine: niente ping");

// la chiave deve essere già online, o i motori scartano il ping
const live = (await get(payload.keyLocation)).trim();
if (live !== payload.key) throw new Error(`${payload.keyLocation} non contiene la chiave`);

console.log(`${payload.urlList.length} pagine:\n${payload.urlList.join("\n")}`);
if (process.argv.includes("--dry-run")) process.exit(0);
const r = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});
// 200 e 202 = ricevuto; 403 chiave non valida, 422 indirizzi di un altro host, 429 troppi ping
console.log(`IndexNow: HTTP ${r.status}`);
if (r.status !== 200 && r.status !== 202) process.exit(1);
