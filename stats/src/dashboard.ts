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

// ── Accessi all'app (tabella `access`, scritta dal worker licenze) ───────────
export interface AccessRow { ts: number; kind: string; outcome: string; reason: string; device: string; key: string; country: string }

/** Prove, licenze vive, rifiuti, vendite. Una licenza è "viva" se si è rivalidata nelle ultime 48 ore. */
export function summarizeAccess(rows: AccessRow[], now: number) {
  const lastTrial = new Map<string, AccessRow>();
  const licenses = new Map<string, { key: string; lastOk: number; macs: Set<string>; lastRefused: AccessRow | null; country: string }>();
  let refused7d = 0;
  const sales: string[] = [];
  for (const r of rows) {
    if (r.kind === "trial" && r.device) lastTrial.set(r.device, r);
    if ((r.kind === "validate" || r.kind === "activate") && r.key) {
      const l = licenses.get(r.key) ?? { key: r.key, lastOk: 0, macs: new Set<string>(), lastRefused: null, country: r.country };
      if (r.outcome === "ok") { l.lastOk = Math.max(l.lastOk, r.ts); if (r.device) l.macs.add(r.device); }
      else l.lastRefused = r;
      licenses.set(r.key, l);
    }
    if (r.outcome === "refused" && now - r.ts < 7 * DAY) refused7d++;
    if (r.kind === "sale") sales.push(r.reason);
  }
  const trials = [...lastTrial.values()];
  // le rivalide orarie riuscite sono rumore: nella cronologia restano solo il resto
  const recent = rows.filter((r) => !(r.kind === "validate" && r.outcome === "ok")).slice(-40).reverse();
  return {
    trialing: trials.filter((t) => t.outcome === "new" || t.outcome === "active").length,
    expiredBack: trials.filter((t) => t.outcome === "expired").length,
    liveLicenses: [...licenses.values()].filter((l) => now - l.lastOk < 2 * DAY).length,
    refused7d,
    sales,
    // una chiave mai passata (inventata o sbagliata) resta nella cronologia, non è una licenza
    licenses: [...licenses.values()].filter((l) => l.lastOk > 0).sort((a, b) => b.lastOk - a.lastOk).map((l) => ({ ...l, macs: l.macs.size })),
    recent,
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

const ROME = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const rome = (ts: number) => (ts ? ROME.format(new Date(ts)) : "mai");

const LABEL: Record<string, string> = {
  "trial:new": "Nuova prova", "trial:refused": "Prova rifiutata (Mac non valido)", "trial:active": "Prova in corso", "trial:expired": "Prova finita, app riaperta",
  "activate:ok": "Licenza attivata", "activate:refused": "Attivazione rifiutata",
  "validate:ok": "Controllo licenza ok", "validate:refused": "Controllo licenza fallito",
  "deactivate:ok": "Licenza tolta da un Mac", "deactivate:refused": "Disattivazione fallita",
  "reset:ok": "Reset dei Mac", "reset:refused": "Reset rifiutato",
  "sale:ok": "Vendita", "refund:ok": "Rimborso", "disabled:ok": "Licenza disabilitata",
};
// colore = stato vero: verde solo per soldi e licenze valide, rosso per i rifiuti, ambra per le prove finite
const TONE = (r: AccessRow) => r.kind === "sale" || r.outcome === "ok" && r.kind !== "refund" && r.kind !== "disabled" ? "ok"
  : r.outcome === "refused" || r.kind === "refund" || r.kind === "disabled" ? "bad" : r.outcome === "expired" ? "warn" : "";

function page(s: ReturnType<typeof summarize>, x: ReturnType<typeof summarizeAccess>, gh: [string, number][] | null, now: number): string {
  const max = Math.max(1, ...s.days.map((d) => d.visits));
  const bars = s.days.map((d) => `<div class="bar" title="${esc(d.day)}: ${d.visits} visite, ${d.downloads} download"><i style="height:${Math.round((d.visits / max) * 100)}%"></i>${d.downloads ? `<b>${d.downloads}</b>` : ""}<span>${esc(d.day.slice(8))}</span></div>`).join("");
  const table = (head: string[], list: (string | number)[][], tones: string[] = []) =>
    `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
      list.map((r, i) => `<tr class="${tones[i] ?? ""}">${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" class="empty">Ancora niente</td></tr>`
    }</tbody></table>`;
  const rate = s.visits ? ((s.downloads / s.visits) * 100).toFixed(1) + "%" : "0%";
  const kpi = (label: string, value: string | number, tone = "") => `<div class="kpi ${tone}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>LinerFM statistiche</title><style>
:root{color-scheme:dark;--bg:#050505;--panel:rgba(255,255,255,.04);--line:rgba(255,255,255,.1);--shadow:0 8px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);
--text:#f5f5f7;--text-2:rgba(235,235,245,.72);--text-3:rgba(235,235,245,.6);--green:#1db954;--red:#ff6b6b;--amber:#e0a955;--r:14px}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-.011em}
main{max-width:1040px;margin:0 auto;padding:28px 16px 64px}
header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:20px}
h1{font-size:26px;font-weight:700;letter-spacing:-.02em;margin:0}.meta{color:var(--text-3);font-size:12px}
h2{font-size:15px;font-weight:600;margin:0 0 12px}section{margin-top:28px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px}.kpi span{color:var(--text-2);font-size:12px}
.kpi b{display:block;font-size:26px;font-weight:650;font-variant-numeric:tabular-nums;margin-top:2px}
.kpi.ok b{color:var(--green)}.kpi.bad b{color:var(--red)}.kpi.warn b{color:var(--amber)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
.chart{display:flex;gap:3px;align-items:flex-end;height:150px;padding:18px 0 20px;border-bottom:1px solid var(--line)}
.bar{flex:1;height:100%;position:relative;display:flex;align-items:flex-end}.bar i{display:block;width:100%;background:rgba(235,235,245,.28);border-radius:4px 4px 0 0;min-height:2px}
.bar b{position:absolute;top:-16px;width:100%;text-align:center;font-size:11px;color:var(--green);font-weight:600}.bar span{position:absolute;bottom:-18px;width:100%;text-align:center;font-size:10px;color:var(--text-3)}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--text-3);font-weight:500;font-size:12px;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.05);white-space:nowrap}tr:last-child td{border-bottom:0}
td:first-child{color:var(--text-2)}tr.ok td:nth-child(2){color:var(--green)}tr.bad td:nth-child(2){color:var(--red)}tr.warn td:nth-child(2){color:var(--amber)}
.empty{color:var(--text-3);text-align:center;padding:14px}.note{color:var(--text-3);font-size:12px;margin:10px 0 0}
</style></head><body><main>
<header><h1>LinerFM</h1><div class="meta">Aggiornato ${esc(rome(now))} (ora di Roma) · ultimi 30 giorni · ?notrack=1 sul sito esclude il tuo browser</div></header>

<section><h2>App</h2><div class="kpis">
${kpi("Mac in prova", x.trialing)}${kpi("Prove finite che riaprono", x.expiredBack, x.expiredBack ? "warn" : "")}${kpi("Licenze attive (48 ore)", x.liveLicenses, x.liveLicenses ? "ok" : "")}${kpi("Rifiuti in 7 giorni", x.refused7d, x.refused7d ? "bad" : "")}${kpi("Vendite registrate", x.sales.length, x.sales.length ? "ok" : "")}
</div><p class="note">Le prove si contano per Mac. Il worker oggi non verifica che l'identificativo del Mac sia vero: una chiamata inventata crea una prova finta. Registro attivo dal 17/10.</p></section>

<section class="grid">
<div class="panel scroll"><h2>Ultimi accessi</h2>${table(["Quando", "Evento", "Dettaglio", "Mac", "Chiave", "Paese"],
    x.recent.map((r) => [rome(r.ts), LABEL[`${r.kind}:${r.outcome}`] ?? `${r.kind} ${r.outcome}`, r.reason, r.device, r.key ? `····${r.key}` : "", r.country]), x.recent.map(TONE))}</div>
<div class="panel scroll"><h2>Licenze</h2>${table(["Chiave", "Ultimo controllo ok", "Mac", "Ultimo rifiuto"],
    x.licenses.map((l) => [`····${l.key}`, rome(l.lastOk), l.macs, l.lastRefused ? `${rome(l.lastRefused.ts)} ${l.lastRefused.reason}` : ""]),
    x.licenses.map((l) => (now - l.lastOk < 2 * DAY ? "ok" : l.lastRefused ? "bad" : "")))}</div>
</section>

<section><h2>Sito</h2><div class="kpis">${kpi("Visite", s.visits)}${kpi("Click sul download", s.downloads)}${kpi("Visite che scaricano", rate)}</div></section>
<section class="panel"><h2>Visite al giorno <span class="meta">(numero verde = download)</span></h2><div class="chart">${bars}</div></section>
<section class="grid">
<div class="panel scroll"><h2>Da dove arrivano</h2>${table(["Fonte", "Visite", "Download"], s.bySource)}</div>
<div class="panel scroll"><h2>Paesi</h2>${table(["Paese", "Visite"], s.countries)}</div>
</section>
<section class="grid">
<div class="panel scroll"><h2>Ultimi download dal sito</h2>${table(["Quando", "Mac", "Da", "Paese"], s.recent.map((r) => [r.when, r.arch, r.from, r.country]))}</div>
<div class="panel scroll"><h2>Download DMG su GitHub</h2>${gh ? table(["Release", "Download"], gh) : `<p class="empty">GitHub non raggiungibile</p>`}</div>
</section>
</main></body></html>`;
}

export async function handleDashboard(req: Request, env: Env, now: number, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.DASH_PASSWORD) return new Response("dashboard closed: DASH_PASSWORD not set", { status: 503 });
  if (!authorized(req, env.DASH_PASSWORD)) {
    return new Response("password required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LinerFM stats", charset="UTF-8"', "Cache-Control": "no-store" } });
  }
  const since = now - 30 * DAY;
  const [hits, access, gh] = await Promise.all([
    env.DB.prepare("SELECT ts, kind, ref, src, arch, sid, country FROM hits WHERE ts > ? ORDER BY ts").bind(since).all<Row>(),
    env.DB.prepare("SELECT ts, kind, outcome, reason, device, key, country FROM access WHERE ts > ? ORDER BY ts").bind(since).all<AccessRow>()
      .catch(() => ({ results: [] as AccessRow[] })),
    githubDownloads(fetchImpl),
  ]);
  return new Response(page(summarize(hits.results ?? [], now), summarizeAccess(access.results ?? [], now), gh, now), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" },
  });
}
