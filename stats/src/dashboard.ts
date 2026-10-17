// GET /dashboard: the owner's private view of the site numbers, last 30 days.
// HTTP Basic auth against the DASH_PASSWORD secret (`wrangler secret put DASH_PASSWORD`);
// without the secret the page stays closed. Nothing is cached or indexed.
export interface Env { DB: D1Database; DASH_PASSWORD?: string }

export interface Row { ts: number; kind: string; ref: string; src: string; arch: string; sid: string; country: string }

const DAY = 86_400_000;
const RELEASES = "https://api.github.com/repos/WhoIsMars/linerfm-releases/releases?per_page=10";

function authorized(req: Request, password: string): boolean {
  const h = req.headers.get("Authorization") ?? "";
  if (!h.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = atob(h.slice(6)); } catch { return false; }
  const given = decoded.slice(decoded.indexOf(":") + 1);
  if (given.length !== password.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ password.charCodeAt(i);
  return diff === 0;
}

const ENT: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ENT[c]);
const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** One visit = one browser tab (sid) with a view. Source: ?src tag, else referrer host, else direct. */
export function summarize(rows: Row[], now: number) {
  const tabs = new Map<string, { src: string; ref: string; country: string; viewed: boolean; downloads: number; day: string }>();
  for (const r of rows) {
    const t = tabs.get(r.sid) ?? { src: "", ref: "", country: r.country, viewed: false, downloads: 0, day: dayOf(r.ts) };
    if (!t.src && r.src) t.src = r.src;
    if (!t.ref && r.ref && r.kind === "view") t.ref = r.ref;
    if (r.kind === "view") t.viewed = true;
    tabs.set(r.sid, t);
  }
  const from = (sid: string) => { const t = tabs.get(sid)!; return t.src || t.ref || "diretto"; };
  const sources = new Map<string, [number, number]>();
  const countries = new Map<string, number>();
  for (const [sid, t] of tabs) {
    if (!t.viewed) continue;
    const s = sources.get(from(sid)) ?? [0, 0];
    s[0]++;
    sources.set(from(sid), s);
    countries.set(t.country || "?", (countries.get(t.country || "?") ?? 0) + 1);
  }
  const downloads = rows.filter((r) => r.kind === "download");
  for (const r of downloads) {
    const s = sources.get(from(r.sid)) ?? [0, 0];
    s[1]++;
    sources.set(from(r.sid), s);
  }
  const days = Array.from({ length: 30 }, (_, i) => ({ day: dayOf(now - (29 - i) * DAY), visits: 0, downloads: 0 }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const t of tabs.values()) if (t.viewed && byDay.has(t.day)) byDay.get(t.day)!.visits++;
  for (const r of downloads) if (byDay.has(dayOf(r.ts))) byDay.get(dayOf(r.ts))!.downloads++;
  const visits = [...tabs.values()].filter((t) => t.viewed).length;
  return {
    visits,
    downloads: downloads.length,
    bySource: [...sources.entries()].map(([k, [vi, dl]]) => [k, vi, dl] as [string, number, number]).sort((a, b) => b[1] - a[1] || b[2] - a[2]),
    countries: [...countries.entries()].sort((a, b) => b[1] - a[1]),
    days,
    recent: downloads.slice(-15).reverse().map((r) => ({ when: new Date(r.ts).toISOString().slice(0, 16).replace("T", " "), arch: r.arch, from: from(r.sid), country: r.country })),
  };
}

async function githubDownloads(fetchImpl: typeof fetch): Promise<[string, number][] | null> {
  try {
    const r = await fetchImpl(RELEASES, { headers: { "User-Agent": "linerfm-site-stats", Accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const list = (await r.json()) as { tag_name: string; assets: { name: string; download_count: number }[] }[];
    return list.map((x) => [x.tag_name, x.assets.filter((a) => a.name.endsWith(".dmg")).reduce((n, a) => n + a.download_count, 0)]);
  } catch { return null; }
}

function page(s: ReturnType<typeof summarize>, gh: [string, number][] | null, now: number): string {
  const max = Math.max(1, ...s.days.map((d) => d.visits));
  const bars = s.days.map((d) => `<div class="bar" title="${esc(d.day)}: ${d.visits} visite, ${d.downloads} download"><i style="height:${Math.round((d.visits / max) * 100)}%"></i>${d.downloads ? `<b>${d.downloads}</b>` : ""}<span>${esc(d.day.slice(8))}</span></div>`).join("");
  const rows = (list: (string | number)[][]) => list.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="9">nessun dato</td></tr>`;
  const rate = s.visits ? ((s.downloads / s.visits) * 100).toFixed(1) + "%" : "0%";
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>LinerFM statistiche</title><style>
:root{--bg:#0b0d0c;--fg:#e9ecea;--mute:#8b938f;--line:#232826;--acc:#1ed760}
@media (prefers-color-scheme:light){:root{--bg:#f6f7f6;--fg:#141716;--mute:#5d6561;--line:#dde1de;--acc:#12a148}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,system-ui,sans-serif;padding:20px 16px;max-width:900px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px;color:var(--mute);font-weight:600}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.k div{border:1px solid var(--line);border-radius:10px;padding:12px}.k b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
.chart{display:flex;gap:3px;align-items:flex-end;height:140px;border-bottom:1px solid var(--line);padding-top:16px}
.bar{flex:1;height:100%;position:relative;display:flex;align-items:flex-end}.bar i{display:block;width:100%;background:var(--mute);opacity:.55;border-radius:3px 3px 0 0;min-height:1px}
.bar b{position:absolute;top:-16px;width:100%;text-align:center;font-size:11px;color:var(--acc)}.bar span{position:absolute;bottom:-18px;width:100%;text-align:center;font-size:10px;color:var(--mute)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}td{border-bottom:1px solid var(--line);padding:6px 4px}td:not(:first-child){text-align:right}
.m{color:var(--mute);font-size:13px}</style></head><body>
<h1>LinerFM, sito</h1><div class="m">Ultimi 30 giorni, orari UTC. Aggiornato ${esc(new Date(now).toISOString().slice(0, 16).replace("T", " "))} UTC. Il tuo browser non si conta se apri il sito con ?notrack=1.</div>
<h2>Totali</h2><div class="k"><div>Visite<b>${s.visits}</b></div><div>Click sul download<b>${s.downloads}</b></div><div>Visite che scaricano<b>${rate}</b></div></div>
<h2>Visite al giorno (in verde i download)</h2><div class="chart">${bars}</div>
<h2 style="margin-top:34px">Da dove arrivano</h2><table><tr class="m"><td>fonte</td><td>visite</td><td>download</td></tr>${rows(s.bySource)}</table>
<h2>Paesi</h2><table>${rows(s.countries)}</table>
<h2>Ultimi download dal sito</h2><table>${rows(s.recent.map((r) => [r.when, r.arch, r.from, r.country]))}</table>
<h2>Download DMG su GitHub (tutte le fonti, per release)</h2><table>${gh ? rows(gh) : `<tr><td>GitHub non raggiungibile</td></tr>`}</table>
</body></html>`;
}

export async function handleDashboard(req: Request, env: Env, now: number, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.DASH_PASSWORD) return new Response("dashboard closed: DASH_PASSWORD not set", { status: 503 });
  if (!authorized(req, env.DASH_PASSWORD)) {
    return new Response("password required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LinerFM stats", charset="UTF-8"', "Cache-Control": "no-store" } });
  }
  const { results } = await env.DB.prepare("SELECT ts, kind, ref, src, arch, sid, country FROM hits WHERE ts > ? ORDER BY ts").bind(now - 30 * DAY).all<Row>();
  const [s, gh] = [summarize(results ?? [], now), await githubDownloads(fetchImpl)];
  return new Response(page(s, gh, now), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" },
  });
}
