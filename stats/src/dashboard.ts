import { TABS, navHtml, summarizeUsers, readLedger, cachedJson, loadGithub, githubReleases, readOrders, tabUsers, tabActivity, tabDownloads, tabSales, tabSecurity, tabEvents, tabSocial, type GhRelease, type SocialRow } from "./admin";

// GET /dashboard: the owner's private view of the site numbers, last 30 days.
// HTTP Basic auth against the DASH_PASSWORD secret (`wrangler secret put DASH_PASSWORD`);
// without the secret the page stays closed. Nothing is cached or indexed.
export interface Env { DB: D1Database; DASH_PASSWORD?: string; DASH_LINK_TOKEN?: string; LS_API_KEY?: string; LS_STORE_ID?: string; TRIAL_LEDGER?: KVNamespace }

export interface Row { ts: number; kind: string; ref: string; src: string; arch: string; sid: string; country: string }

export const DAY = 86_400_000;
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

export const ENT: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ENT[c]);
export const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** Una scheda del browser (sid): le sue visite e i suoi clic sui pulsanti di download. */
export interface Session { sid: string; first: number; last: number; firstClick: number; lastClick: number; views: number; clicks: number; arches: string[]; from: string; country: string }

/** "1 clic" oppure "4 clic in 1 min": quanti pulsanti ha premuto la stessa persona. */
export const clicksText = (p: Session) => (p.clicks === 1 ? "1 clic" : `${p.clicks} clic in ${Math.max(1, Math.round((p.lastClick - p.firstClick) / 60_000))} min`);

export const archName = (a: string) => (a === "apple-silicon" ? "Apple Silicon" : a === "intel" ? "Intel" : a === "windows" ? "Windows" : a === "github-page" ? "pagina GitHub" : a);

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
  for (const sid of new Set(downloads.map((r) => r.sid))) {
    const s = sources.get(from(sid)) ?? [0, 0];
    s[1]++;
    sources.set(from(sid), s);
  }
  // Una persona = una scheda del browser: 4 clic sui pulsanti in un minuto sono una persona sola.
  const sessions = new Map<string, Session>();
  for (const r of rows) {
    const s = sessions.get(r.sid) ?? { sid: r.sid, first: r.ts, last: r.ts, firstClick: 0, lastClick: 0, views: 0, clicks: 0, arches: [], from: from(r.sid), country: r.country };
    s.last = r.ts;
    if (r.kind === "view") s.views++;
    if (r.kind === "download") { s.clicks++; s.firstClick ||= r.ts; s.lastClick = r.ts; if (!s.arches.includes(r.arch)) s.arches.push(r.arch); }
    sessions.set(r.sid, s);
  }
  const people = [...sessions.values()].filter((s) => s.clicks > 0).sort((a, b) => b.lastClick - a.lastClick);
  const days = Array.from({ length: 30 }, (_, i) => ({ day: dayOf(now - (29 - i) * DAY), visits: 0, downloads: 0 }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const t of tabs.values()) if (t.viewed && byDay.has(t.day)) byDay.get(t.day)!.visits++;
  const dlDays = new Set(downloads.map((r) => `${dayOf(r.ts)}|${r.sid}`));
  for (const k of dlDays) { const d = byDay.get(k.slice(0, 10)); if (d) d.downloads++; }
  const visits = [...tabs.values()].filter((t) => t.viewed).length;
  return {
    visits,
    downloads: downloads.length,
    downloaders: people.length,
    people,
    sessions: [...sessions.values()],
    bySource: [...sources.entries()].map(([k, [vi, dl]]) => [k, vi, dl] as [string, number, number]).sort((a, b) => b[1] - a[1] || b[2] - a[2]),
    countries: [...countries.entries()].sort((a, b) => b[1] - a[1]),
    days,
    recent: downloads.slice(-15).reverse().map((r) => ({ ts: r.ts, arch: r.arch, from: from(r.sid), country: r.country })),
  };
}

// ── Accessi all'app (tabella `access`, scritta dal worker licenze) ───────────
export interface AccessRow { id?: number; ts: number; kind: string; outcome: string; reason: string; device: string; key: string; country: string }

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

// ── Vendite vere, da Lemon Squeezy (chiave in sola lettura, secret LS_API_KEY) ──
export async function readSales(fetchImpl: typeof fetch, apiKey: string | undefined, storeId: string) {
  if (!apiKey) return null;
  try {
    const out = { paid: 0, cents: 0, currency: "EUR", last: "", refunded: 0, times: [] as number[] };
    for (let n = 1, last = 1; n <= last && n <= 10; n++) {
      const r = await fetchImpl(`https://api.lemonsqueezy.com/v1/orders?filter[store_id]=${storeId}&page[number]=${n}&page[size]=100`,
        { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" } });
      if (!r.ok) return null;
      const body = (await r.json()) as { data?: { attributes: Record<string, any> }[]; meta?: { page?: { lastPage?: number } } };
      last = body.meta?.page?.lastPage ?? 1;
      for (const { attributes: a } of body.data ?? []) {
        if (a.test_mode) continue;
        if (a.refunded) { out.refunded++; continue; }
        if (a.status !== "paid" || !(a.total > 0)) continue; // 0 € = chiave regalata
        out.paid++; out.cents += a.total; out.currency = a.currency; out.times.push(Date.parse(a.created_at));
        if (a.created_at > out.last) out.last = a.created_at;
      }
    }
    return out;
  } catch { return null; }
}

export const ROME = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const rome = (ts: number) => (ts ? ROME.format(new Date(ts)) : "mai");
export const COUNTRY = new Intl.DisplayNames(["it"], { type: "region" });
export const countryName = (c: string) => { try { return c && c !== "?" ? COUNTRY.of(c) ?? c : "Sconosciuto"; } catch { return c || "Sconosciuto"; } };
export const money = (cents: number, cur: string) => new Intl.NumberFormat("it-IT", { style: "currency", currency: cur || "EUR" }).format(cents / 100);
export const ago = (ts: number, now: number) => {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "adesso"; if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60); if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  const d = Math.round(h / 24); return `${d} ${d === 1 ? "giorno" : "giorni"} fa`;
};

/** Il traffico di prova dell'owner e di Claude non è traffico. */
export const TEST_SOURCES = new Set(["verifica", "test", "claude"]);

const SOURCE_NAMES: [RegExp, string][] = [
  [/^(www\.)?youtube(\.com)?$|^youtu\.be$|^m\.youtube\.com$/, "YouTube"], [/^(www\.)?tiktok(\.com)?$/, "TikTok"],
  [/^(www\.|l\.)?instagram(\.com)?$|^ig$/, "Instagram"], [/^(www\.|old\.)?reddit(\.com)?$/, "Reddit"],
  [/^news\.ycombinator\.com$|^hn$/, "Hacker News"], [/^(www\.)?bing\.com$/, "Bing"], [/^(www\.)?google\.[a-z.]+$/, "Google"],
  [/^(t\.co|x\.com|twitter\.com|x)$/, "X"], [/^(www\.)?alternativeto\.net$|^altto$/, "AlternativeTo"], [/^duckduckgo\.com$/, "DuckDuckGo"],
  [/^(discord\.com|discord)$/, "Discord"], [/^github\.com$/, "GitHub"], [/^diretto$/, "Diretto o sconosciuto"],
];
export function prettySource(s: string): string {
  for (const [re, name] of SOURCE_NAMES) if (re.test(s)) return name;
  return s;
}

export const REASON: Record<string, string> = {
  invalid: "chiave non valida", activation_limit: "limite di Mac raggiunto", wrong_product: "chiave di un altro prodotto",
  refunded: "ordine rimborsato", disabled: "licenza disabilitata", device_mismatch: "chiave usata su un altro Mac",
  bad_device: "identificativo del Mac non valido", rate_limited: "troppi reset oggi", inactive: "non attiva", expired: "scaduta",
};
export const reasonText = (r: string) => REASON[r] ?? r;

export function eventLine(r: AccessRow): { tone: string; title: string; detail: string } {
  const mac = r.device ? `Mac ${r.device}` : "";
  const key = r.key ? `chiave ····${r.key}` : "";
  const why = r.reason ? reasonText(r.reason) : "";
  switch (`${r.kind}:${r.outcome}`) {
    case "trial:new": return { tone: "", title: "Nuova prova gratuita", detail: mac };
    case "trial:active": return { tone: "", title: "Prova in corso, app aperta", detail: mac };
    case "trial:expired": return { tone: "warn", title: "Prova finita, app riaperta e bloccata", detail: `${mac} · finita da ${r.reason.replace("d", " gg")}` };
    case "trial:refused": return { tone: "bad", title: "Prova rifiutata", detail: [mac, why].filter(Boolean).join(" · ") };
    case "activate:ok": return { tone: "ok", title: "Licenza attivata", detail: [key, mac].filter(Boolean).join(" · ") };
    case "activate:refused": return { tone: "bad", title: "Attivazione rifiutata", detail: [why, key, mac].filter(Boolean).join(" · ") };
    case "validate:refused": return { tone: "bad", title: "Controllo licenza fallito", detail: [why, key, mac].filter(Boolean).join(" · ") };
    case "deactivate:ok": return { tone: "", title: "Licenza tolta da un Mac", detail: [key, mac].filter(Boolean).join(" · ") };
    case "reset:ok": return { tone: "", title: "Reset dei Mac della licenza", detail: key };
    case "reset:refused": return { tone: "bad", title: "Reset rifiutato", detail: [why, key].filter(Boolean).join(" · ") };
    case "sale:ok": return { tone: "ok", title: "Vendita", detail: r.reason };
    case "refund:ok": return { tone: "bad", title: "Rimborso", detail: "chiavi dell'ordine bloccate" };
    case "disabled:ok": return { tone: "bad", title: "Licenza disabilitata", detail: key };
    default: return { tone: "", title: `${r.kind} ${r.outcome}`, detail: [why, key, mac].filter(Boolean).join(" · ") };
  }
}

type Sales = Awaited<ReturnType<typeof readSales>>;

// ── Pagina ────────────────────────────────────────────────────────────────────
// Colori di sistema Apple in modalità scura, più il verde dell'app per i soldi.
export const C = { green: "#1DB954", blue: "#0A84FF", indigo: "#5E5CE6", orange: "#FF9F0A", teal: "#40C8E0", red: "#FF453A", yellow: "#FFD60A", purple: "#BF5AF2", gray: "#8E8E93" };
export const BRAND: Record<string, string> = { YouTube: "#FF3B30", TikTok: "#25F4EE", Instagram: "#E1306C", Reddit: "#FF4500", "Hacker News": "#FF6600", Bing: "#0A84FF", Google: "#34A853", X: "#E5E5EA", AlternativeTo: "#3A8BEA", Discord: "#5865F2", GitHub: "#E5E5EA" };

export const ICON: Record<string, string> = {
  money: '<path d="M3 7h18v10H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
  down: '<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  mac: '<path d="M4 6h16v10H4zM2 19h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  key: '<circle cx="8" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11.5 12H21m-3 0v3m-3-3v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  alert: '<path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4m0 3v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
export const icon = (name: string) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${ICON[name]}</svg>`;
export const flag = (c: string) => (/^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : "🌐");

/** Una riga per persona che ha scaricato: pulsanti premuti, fonte, paese, clic. */
export function personFeed(people: Session[], now: number): string {
  return `<ul class="feed">${people.map((p) => `<li style="--c:${C.indigo}"><i class="badge"></i><div><b>${esc(p.arches.map(archName).join(", "))}</b><span>da ${esc(prettySource(p.from))} · ${flag(p.country)} ${esc(countryName(p.country))} · ${esc(clicksText(p))}</span></div><time title="${esc(ago(p.last, now))}">${esc(rome(p.firstClick))}</time></li>`).join("")}</ul>`;
}

/** Linea dei 30 giorni dentro un riquadro: solo forma, niente assi. */
export function spark(values: number[], color: string): string {
  if (!values.some((v) => v > 0)) return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="26" x2="100" y2="26" stroke="${color}" stroke-opacity=".35" stroke-width="2"/></svg>`;
  const max = Math.max(...values), step = 100 / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(26 - (v / max) * 22).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,28 ${pts.join(" ")} 100,28" fill="${color}" fill-opacity=".18"/><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

export const sum = (a: number[]) => a.reduce((n, v) => n + v, 0);
export function delta(cur: number, prev: number): string {
  if (!cur && !prev) return "";
  const d = cur - prev;
  if (d === 0) return `<span class="delta flat">uguale ai 7 giorni prima</span>`;
  return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)} rispetto ai 7 giorni prima</span>`;
}


const CSS = `:root{color-scheme:dark;--bg:#000;--card:#1C1C1E;--card-2:#2C2C2E;--line:rgba(84,84,88,.45);--text:#fff;--text-2:rgba(235,235,245,.72);--text-3:rgba(235,235,245,.55);--r:20px}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;color:var(--text);font:15px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1280px;margin:0 auto;padding:max(24px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 56px max(16px,env(safe-area-inset-left))}
.top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
h1{font:700 34px/1.1 -apple-system,"SF Pro Display",sans-serif;letter-spacing:-.02em;margin:0}
.live{display:inline-flex;align-items:center;gap:8px;color:var(--text-3);font-size:13px}.live i{width:8px;height:8px;border-radius:50%;background:${C.green};box-shadow:0 0 0 0 ${C.green};animation:pulse 2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(29,185,84,.6)}70%{box-shadow:0 0 0 8px rgba(29,185,84,0)}100%{box-shadow:0 0 0 0 rgba(29,185,84,0)}}
.headline{font:600 22px/1.3 -apple-system,"SF Pro Display",sans-serif;letter-spacing:-.01em;margin:14px 0 22px;color:var(--text-2)}
.tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
.tile{position:relative;overflow:hidden;background:var(--card);border-radius:var(--r);padding:16px 16px 14px;min-height:150px;display:flex;flex-direction:column;
  background-image:radial-gradient(120% 90% at 100% 0%,color-mix(in srgb,var(--c) 22%,transparent),transparent 60%)}
.tile header{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--c)}
.ico{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:9px;background:color-mix(in srgb,var(--c) 22%,transparent);color:var(--c)}
.tile .num{font:700 40px/1 -apple-system,"SF Pro Display",sans-serif;letter-spacing:-.02em;margin:14px 0 6px;font-variant-numeric:tabular-nums}
.tile.big .num{font-size:52px;color:var(--c)}
.tile footer{font-size:12.5px;color:var(--text-3);position:relative;z-index:1}.why{display:block;margin-top:6px;font-size:11.5px;line-height:1.35;color:var(--text-3);opacity:.85}
.spark{position:absolute;left:0;right:0;bottom:0;width:100%;height:46px;opacity:.9}
.tile:has(.spark) footer{margin-bottom:34px}
.delta{font-weight:600}.delta.up{color:${C.green}}.delta.down{color:${C.red}}.delta.flat{color:var(--text-3)}
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px;margin-top:12px}
.card{background:var(--card);border-radius:var(--r);padding:18px}.s4{grid-column:span 4}.s5{grid-column:span 5}.s7{grid-column:span 7}.s8{grid-column:span 8}.s12{grid-column:span 12}
h2{font:700 17px/1.2 -apple-system,"SF Pro Display",sans-serif;margin:0 0 14px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}h2 small{font:400 13px/1 inherit;color:var(--text-3)}
.funnel{list-style:none;margin:0;padding:0;display:grid;gap:14px}.funnel .fl{display:flex;justify-content:space-between;font-size:14px;color:var(--text-2)}.funnel b{color:var(--text);font-size:20px;font-variant-numeric:tabular-nums}
.track{height:10px;border-radius:5px;background:var(--card-2);margin:6px 0 3px;overflow:hidden}.track i{display:block;height:100%;border-radius:5px;background:var(--c);transition:width .8s cubic-bezier(.22,1,.36,1)}
.funnel small,.hbars small{color:var(--text-3);font-size:12px}
.feed{list-style:none;margin:0;padding:0}.feed li{display:grid;grid-template-columns:12px 1fr auto;gap:12px;align-items:start;padding:10px 0;border-top:.5px solid var(--line)}.feed li:first-child{border-top:0;padding-top:0}
.badge{width:10px;height:10px;border-radius:50%;background:var(--c);margin-top:5px;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 25%,transparent)}
.feed li:has(.dismiss){grid-template-columns:12px 1fr auto auto}.dismiss{margin:0}.dismiss button{font:inherit;font-size:12px;color:var(--text-3);background:none;border:.5px solid var(--line);border-radius:6px;padding:2px 8px;cursor:pointer}.dismiss button:hover{color:inherit}
.feed b{display:block;font-weight:600;font-size:14px}.feed span{color:var(--text-3);font-size:12.5px}.feed time{color:var(--text-3);font-size:12.5px;white-space:nowrap}
.empty{display:flex;gap:14px;align-items:flex-start;color:var(--text-2);font-size:14px}.empty p{margin:3px 0 0}
.lic{list-style:none;margin:0;padding:0}.lic li{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 0;border-top:.5px solid var(--line)}.lic li:first-child{border-top:0;padding-top:0}
.lic small{flex-basis:100%;color:var(--text-3);font-size:12.5px}.mono{font:500 14px ui-monospace,"SF Mono",Menlo,monospace}
.tag{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;color:var(--c);background:color-mix(in srgb,var(--c) 20%,transparent)}
.chart{display:flex;gap:5px;align-items:flex-end;height:180px;padding-bottom:22px;border-bottom:.5px solid var(--line);background:repeating-linear-gradient(to top,transparent 0,transparent calc(25% - .5px),var(--line) calc(25% - .5px),var(--line) 25%);background-size:100% calc(100% - 22px);background-repeat:no-repeat}
.col{flex:1;height:100%;position:relative;display:flex;align-items:flex-end;padding-bottom:22px;margin-bottom:-22px}
.stack{position:relative;width:100%;min-height:3px;border-radius:6px 6px 2px 2px;overflow:hidden;display:flex;flex-direction:column-reverse}
.stack .v{position:absolute;inset:0;background:linear-gradient(to top,color-mix(in srgb,${C.blue} 70%,transparent),${C.blue})}.stack .d{position:relative;display:block;width:100%;background:${C.green};z-index:1}
.col span{position:absolute;bottom:0;left:50%;transform:translateX(-50%);font-size:11px;color:var(--text-3);white-space:nowrap}
.col em{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:var(--card-2);color:var(--text);font:600 12px/1.35 inherit;font-style:normal;padding:6px 9px;border-radius:9px;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,.5)}
.col:hover em{display:block}.col:hover .stack{filter:brightness(1.2)}
.legend{display:flex;gap:16px;font-size:13px;color:var(--text-3)}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.hbars{list-style:none;margin:0;padding:0;display:grid;gap:12px}.hbars li{display:grid;grid-template-columns:1fr auto;gap:0 10px;align-items:center}.hbars span{font-size:14px;color:var(--text-2)}.hbars b{font-variant-numeric:tabular-nums}.hbars .track{grid-column:1/3;margin:4px 0 0}
.gh{margin:14px 0 0;color:var(--text-3);font-size:13px}.gh b{color:var(--text);font-size:16px}
.muted{color:var(--text-3);font-size:14px;margin:0}
.foot{color:var(--text-3);font-size:12.5px;margin:18px 4px 0;line-height:1.5}
@media(max-width:1100px){.tiles{grid-template-columns:repeat(3,1fr)}.s4,.s5,.s7,.s8{grid-column:span 6}}
@media(max-width:720px){h1{font-size:28px}.headline{font-size:18px}.tiles{grid-template-columns:1fr 1fr;gap:10px}.tile.big,.tile:last-child{grid-column:span 2}.tile{min-height:136px}.tile .num{font-size:34px}.tile.big .num{font-size:44px}
  .s4,.s5,.s7,.s8,.s12{grid-column:span 12}.chart{gap:2px;height:150px}}
@media(prefers-reduced-motion:reduce){.live i{animation:none}.track i{transition:none}}
.nav{display:flex;gap:4px;padding:4px;margin:16px 0 4px;background:var(--card);border-radius:12px;overflow-x:auto;scrollbar-width:none;width:max-content;max-width:100%}
.nav::-webkit-scrollbar{display:none}.nav a{padding:7px 14px;border-radius:9px;color:var(--text-2);text-decoration:none;font-size:14px;font-weight:600;white-space:nowrap}
.nav a:hover{color:var(--text)}.nav a[aria-current="page"]{background:var(--card-2);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.4)}
.table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px}.table th{text-align:left;color:var(--text-3);font-weight:600;font-size:12px;padding:0 10px 10px;white-space:nowrap}
.table td{padding:11px 10px;border-top:.5px solid var(--line);white-space:nowrap}.table td:first-child,.table th:first-child{padding-left:0}.scroll{overflow-x:auto;margin:0 -2px}
.state{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--c)}.state::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}`;

const SCRIPT = `(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function countUp(root) {
    if (reduce) return;
    root.querySelectorAll(".num[data-n]").forEach((el) => {
      const n = Number(el.dataset.n); if (!n || n > 9999) return;
      const t0 = performance.now(), d = 700;
      const tick = (t) => { const p = Math.min(1, (t - t0) / d); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }
  function ago() {
    const el = document.getElementById("upd"); if (!el) return;
    const s = Math.round((Date.now() - Number(el.dataset.ts)) / 1000);
    el.firstChild.textContent = s < 60 ? "Aggiornato adesso" : "Aggiornato " + Math.round(s / 60) + " min fa";
  }
  countUp(document);
  setInterval(ago, 15000);
  // ogni minuto si ricarica da sola, senza lampi: sostituisce solo il contenuto
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(location.pathname, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return;
      const next = new DOMParser().parseFromString(await r.text(), "text/html").getElementById("app");
      if (next) document.getElementById("app").replaceWith(next);
    } catch {}
  }, 60000);
})();`;

/** Guscio comune a tutte le schede: intestazione, navigazione, stile, aggiornamento automatico. */
export function shell(nav: string, body: string, now: number): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#000000"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="LinerFM"><title>LinerFM, admin</title><style>${CSS}</style></head><body><main id="app">
<div class="top"><h1>LinerFM</h1><span class="live"><i></i><span id="upd" data-ts="${now}">Aggiornato adesso · ${esc(rome(now))}</span></span></div>
${nav}
${body}
</main>
<script>${SCRIPT}</script></body></html>`;
}

function page(s: ReturnType<typeof summarize>, x: ReturnType<typeof summarizeAccess>, sales: Sales, gh: [string, number][] | null, now: number, nav: string): string {
  const visitsByDay = s.days.map((d) => d.visits), dlByDay = s.days.map((d) => d.downloads);
  const v7 = sum(visitsByDay.slice(-7)), v7p = sum(visitsByDay.slice(-14, -7));
  const d7 = sum(dlByDay.slice(-7)), d7p = sum(dlByDay.slice(-14, -7));
  const salesDays = s.days.map((d) => (sales?.times ?? []).filter((t) => new Date(t).toISOString().slice(0, 10) === d.day).length);
  const refused24 = x.recent.filter((r) => r.outcome === "refused" && now - r.ts < DAY).length;
  const salesN = sales ? sales.paid : x.sales.length;
  const lastSale = sales?.last ? ago(Date.parse(sales.last), now) : "";

  // why: da dove viene il numero e cosa include, in una riga sotto il numero
  type Tile = { color: string; icon: string; label: string; value: string | number; foot: string; why: string; spark?: number[]; big?: boolean };
  const tiles: Tile[] = [
    { color: C.green, icon: "money", label: "Vendite", value: salesN, foot: sales ? `${money(sales.cents, sales.currency)} incassati${lastSale ? ` · ultima ${lastSale}` : ""}` : "Lemon Squeezy non leggibile", why: "ordini veri su Lemon Squeezy, senza quelli di prova e quelli a 0 €", spark: salesDays, big: true },
    { color: C.blue, icon: "eye", label: "Visite, 7 giorni", value: v7, foot: delta(v7, v7p) || `${s.visits} in 30 giorni`, why: "una visita = una scheda del browser aperta sul sito; le tue prove non contano", spark: visitsByDay },
    { color: C.indigo, icon: "down", label: "Persone che hanno scaricato, 7 giorni", value: d7, foot: delta(d7, d7p) || `${s.downloaders} in 30 giorni, ${s.downloads} clic sui pulsanti`,
      why: "chi ha premuto almeno un pulsante di download sul sito; più clic della stessa persona contano uno, e un clic non vuol dire installato", spark: dlByDay },
    { color: C.orange, icon: "mac", label: "Computer in prova", value: x.trialing, foot: x.expiredBack ? `${x.expiredBack} con la prova finita hanno riaperto l'app` : "prove gratuite in corso",
      why: "dal registro accessi del server licenze (attivo dal 17/10), ultimi 30 giorni: Mac e PC Windows insieme, il server non li distingue" },
    { color: C.teal, icon: "key", label: "Licenze attive", value: x.liveLicenses, foot: "controllate nelle ultime 48 ore", why: "app con licenza che hanno contattato il server licenze" },
    refused24
      ? { color: C.red, icon: "alert", label: "Rifiuti, 24 ore", value: refused24, foot: "accessi negati: guarda la cronologia", why: "richieste respinte dal server licenze" }
      : { color: C.green, icon: "shield", label: "Licenze", value: "OK", foot: x.refused7d ? `${x.refused7d} rifiuti negli ultimi 7 giorni` : "nessun rifiuto in 7 giorni", why: "richieste respinte dal server licenze" },
  ];
  const tileHtml = tiles.map((t) => `<article class="tile${t.big ? " big" : ""}" style="--c:${t.color}">
    <header><span class="ico">${icon(t.icon)}</span>${esc(t.label)}</header>
    <b class="num" data-n="${typeof t.value === "number" ? t.value : ""}">${esc(t.value)}</b>
    <footer>${t.foot.startsWith("<span") ? t.foot : esc(t.foot)}<small class="why">${esc(t.why)}</small></footer>${t.spark ? spark(t.spark, t.color) : ""}</article>`).join("");

  // in una frase, quello che conta adesso
  const headline = refused24
    ? `<span style="color:${C.red}">${refused24} ${refused24 === 1 ? "accesso negato" : "accessi negati"} nelle ultime 24 ore.</span> Controlla la cronologia.`
    : salesN
      ? `<span style="color:${C.green}">${salesN} ${salesN === 1 ? "vendita" : "vendite"}</span>, <span style="color:${C.blue}">${v7} visite</span> negli ultimi 7 giorni, licenze in regola.`
      : `<span style="color:${C.blue}">${v7} visite</span> negli ultimi 7 giorni, ancora nessuna vendita, licenze in regola.`;

  const trialsTotal = x.trialing + x.expiredBack;
  const funnelSteps = [
    { label: "Visite al sito", n: s.visits, color: C.blue },
    { label: "Persone che hanno scaricato", n: s.downloaders, color: C.indigo },
    { label: "Computer che aprono l'app", n: trialsTotal, color: C.orange },
    { label: "Vendite", n: salesN, color: C.green },
  ];
  const fMax = Math.max(1, ...funnelSteps.map((f) => f.n));
  const funnel = funnelSteps.map((f, i) => {
    const prev = i ? funnelSteps[i - 1].n : 0;
    const conv = i === 1 ? `${s.downloads} clic sui pulsanti${prev ? `, ${Math.round((f.n / prev) * 100)}% delle visite` : ""}` : i === 2 ? "registrati dal 17/10, Mac e PC Windows insieme" : i && prev ? `${Math.round((f.n / prev) * 100)}% del passo prima` : i ? "" : "ultimi 30 giorni";
    return `<li style="--c:${f.color}"><div class="fl"><span>${esc(f.label)}</span><b>${esc(f.n)}</b></div><div class="track"><i style="width:${Math.max(2, Math.round((f.n / fMax) * 100))}%"></i></div><small>${esc(conv)}</small></li>`;
  }).join("");

  const feed = x.recent.length
    ? `<ul class="feed">${x.recent.slice(0, 12).map((r) => { const e = eventLine(r); const col = e.tone === "ok" ? C.green : e.tone === "bad" ? C.red : e.tone === "warn" ? C.orange : C.blue;
        return `<li style="--c:${col}" title="${esc(r.reason)}"><i class="badge"></i><div><b>${esc(e.title)}</b><span>${esc(e.detail)}${r.country ? ` · ${flag(r.country)} ${esc(countryName(r.country))}` : ""}</span></div><time title="${esc(rome(r.ts))}">${esc(ago(r.ts, now))}</time></li>`; }).join("")}</ul>`
    : `<div class="empty"><span class="ico" style="--c:${C.blue}">${icon("shield")}</span><p>Nessun accesso registrato finora. Prove, attivazioni e controlli delle licenze compaiono qui appena succedono, e arrivano anche su Discord.</p></div>`;

  const licenses = x.licenses.length
    ? `<ul class="lic">${x.licenses.map((l) => { const live = now - l.lastOk < 2 * DAY; const col = live ? C.green : l.lastRefused ? C.red : C.gray;
        return `<li style="--c:${col}"><span class="mono">····${esc(l.key)}</span><span class="tag">${live ? "attiva" : l.lastRefused ? "rifiutata" : "silenziosa"}</span><small>${esc(l.macs)} Mac · controllo ${esc(ago(l.lastOk, now))}${l.lastRefused ? ` · rifiuto: ${esc(reasonText(l.lastRefused.reason))}` : ""}</small></li>`; }).join("")}</ul>`
    : `<p class="muted">Nessuna licenza ha ancora contattato il server.</p>`;

  const maxV = Math.max(1, ...visitsByDay);
  const chart = s.days.map((d, i) => `<div class="col"><div class="stack" style="height:${Math.round((d.visits / maxV) * 100)}%"><i class="v"></i>${d.downloads ? `<i class="d" style="height:${Math.round((d.downloads / Math.max(1, d.visits)) * 100)}%"></i>` : ""}</div><em>${esc(d.day.slice(8))}/${esc(d.day.slice(5, 7))}<br>${d.visits} visite${d.downloads ? `, ${d.downloads} download` : ""}</em>${i % 7 === 2 || i === s.days.length - 1 ? `<span>${esc(d.day.slice(8))}/${esc(d.day.slice(5, 7))}</span>` : ""}</div>`).join("");

  const total = Math.max(1, s.visits);
  const bars = (items: { name: string; n: number; color: string; extra?: string }[], emptyText: string) => items.length
    ? `<ul class="hbars">${items.slice(0, 7).map((it) => `<li style="--c:${it.color}"><span>${it.name}${it.extra ? ` <small>· ${esc(it.extra)}</small>` : ""}</span><b>${esc(it.n)}</b><div class="track"><i style="width:${Math.max(3, Math.round((it.n / total) * 100))}%"></i></div></li>`).join("")}</ul>`
    : `<p class="muted">${esc(emptyText)}</p>`;
  const sources = bars(s.bySource.map(([k, v, d]) => { const name = prettySource(k); return { name: esc(name), n: v, color: BRAND[name] ?? C.gray, extra: d ? `${d} download` : "" }; }), "Ancora nessuna visita.");
  const countries = bars(s.countries.map(([c, n]) => ({ name: `${flag(c)} ${esc(countryName(c))}`, n, color: C.blue })), "Ancora nessuna visita.");

  const ghTotal = gh ? gh.reduce((n, [, c]) => n + c, 0) : 0;
  const downloads = `${s.people.length ? personFeed(s.people.slice(0, 5), now) : `<p class="muted">Nessun download dal sito negli ultimi 30 giorni.</p>`}
    <p class="gh">${gh ? `<b>${esc(ghTotal)}</b> programmi di installazione (DMG e Windows) scaricati da GitHub nelle ultime ${esc(gh.length)} release: contano anche i tuoi download e quelli di prova` : "GitHub non raggiungibile in questo momento"}</p>`;

  return shell(nav, `<p class="headline">${headline}</p>
<section class="tiles">${tileHtml}</section>
<div class="grid">
  <section class="card s5"><h2>Percorso <small>dal sito alla vendita</small></h2><ul class="funnel">${funnel}</ul></section>
  <section class="card s7"><h2>Accessi all'app <small>ultimi eventi</small></h2>${feed}</section>
  <section class="card s8"><h2>Visite al sito <small class="legend"><span><i style="background:${C.blue}"></i>visite</span><span><i style="background:${C.green}"></i>download</span></small></h2><div class="chart">${chart}</div></section>
  <section class="card s4"><h2>Licenze</h2>${licenses}</section>
  <section class="card s4"><h2>Da dove arrivano</h2>${sources}</section>
  <section class="card s4"><h2>Paesi</h2>${countries}</section>
  <section class="card s4"><h2>Download <small>una riga per persona</small></h2>${downloads}</section>
</div>
<p class="foot">Ultimi 30 giorni, ora di Roma. Il traffico di prova è escluso, e il tuo browser non si conta se apri il sito con ?notrack=1. Le prove si contano per Mac: finché il worker non controlla l'identificativo, una chiamata inventata può creare una prova finta.</p>`, now);
}

// ── Accesso: password, oppure link segreto che lascia un cookie per un anno ──
const COOKIE = "lfm_dash";
async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
/** Il cookie non contiene il token del link: è un suo hash, così copiarlo dal browser non rivela il link. */
const cookieValue = (token: string) => sha256hex(`lfm-dash-cookie:${token}`);
function readCookie(req: Request, name: string): string {
  for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

export async function handleDashboard(req: Request, env: Env, now: number, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.DASH_PASSWORD) return new Response("dashboard closed: DASH_PASSWORD not set", { status: 503 });
  const token = env.DASH_LINK_TOKEN && env.DASH_LINK_TOKEN.length >= 32 ? env.DASH_LINK_TOKEN : "";
  const k = new URL(req.url).searchParams.get("k");
  if (token && k && sameText(k, token)) {
    return new Response(null, { status: 302, headers: {
      Location: "/dashboard", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "Set-Cookie": `${COOKIE}=${await cookieValue(token)}; Max-Age=31536000; Path=/dashboard; HttpOnly; Secure; SameSite=Lax`,
    } });
  }
  const viaCookie = token ? sameText(readCookie(req, COOKIE), await cookieValue(token)) : false;
  if (!viaCookie && !authorized(req, env.DASH_PASSWORD)) {
    return new Response("password required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LinerFM stats", charset="UTF-8"', "Cache-Control": "no-store" } });
  }
  if (req.method === "POST") return dismiss(req, env);
  const tabParam = new URL(req.url).searchParams.get("tab") ?? "";
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam : "panoramica";
  const since = now - 30 * DAY;
  const store = env.LS_STORE_ID ?? "406309";
  const accessQ = () => env.DB.prepare("SELECT rowid AS id, ts, kind, outcome, reason, device, key, country FROM access WHERE ts > ? AND rowid NOT IN (SELECT id FROM dismissed) ORDER BY ts").bind(since).all<AccessRow>()
    .then((r) => r.results ?? []).catch(() => [] as AccessRow[]);
  const hitsQ = () => env.DB.prepare("SELECT ts, kind, ref, src, arch, sid, country FROM hits WHERE ts > ? ORDER BY ts").bind(since).all<Row>()
    .then((r) => (r.results ?? []).filter((x) => !TEST_SOURCES.has(x.src))).catch(() => [] as Row[]);
  const ghQ = () => cachedJson<GhRelease[]>(env.DB, "github-releases", now, 30 * 60_000, () => loadGithub(fetchImpl));
  let body: string;
  switch (tab) {
    case "utenti": {
      const [ledger, access] = await Promise.all([readLedger(env.TRIAL_LEDGER), accessQ()]);
      body = tabUsers(summarizeUsers(ledger, access, now), now); break;
    }
    case "attivita": body = tabActivity(await accessQ(), now); break;
    case "download": {
      const [hits, gh] = await Promise.all([hitsQ(), ghQ()]);
      body = tabDownloads(summarize(hits, now), gh ? githubReleases(gh) : null, now); break;
    }
    case "eventi": {
      const [hits, access, orders] = await Promise.all([hitsQ(), accessQ(), readOrders(fetchImpl, env.LS_API_KEY, store)]);
      body = tabEvents(summarize(hits, now).sessions, access, orders, now); break;
    }
    case "social": {
      // la tabella la crea metrics.mjs alla prima scrittura: prima di allora la query fallisce e la scheda lo dice
      const rows = await env.DB.prepare("SELECT ts, platform, item, title, views, likes, comments FROM social WHERE ts > ? ORDER BY ts").bind(now - 60 * DAY).all<SocialRow>()
        .then((r) => r.results ?? []).catch(() => [] as SocialRow[]);
      body = tabSocial(rows, now); break;
    }
    case "vendite": body = tabSales(await readOrders(fetchImpl, env.LS_API_KEY, store), now); break;
    case "sicurezza": body = tabSecurity(await accessQ(), now); break;
    default: {
      const [hits, access, gh, sales] = await Promise.all([hitsQ(), accessQ(), ghQ(), readSales(fetchImpl, env.LS_API_KEY, store)]);
      const ghList: [string, number][] | null = gh ? githubReleases(gh).slice(0, 10).map((r) => [r.tag, r.dmgArm + r.dmgIntel + r.win]) : null;
      return html(page(summarize(hits, now), summarizeAccess(access, now), sales, ghList, now, navHtml(tab)));
    }
  }
  return html(shell(navHtml(tab), body, now));
}

/** POST /dashboard dismiss=<rowid>: hides one access row (a test refusal) from every tab. The row stays in D1. */
async function dismiss(req: Request, env: Env): Promise<Response> {
  // Basic auth travels on cross-site requests too: only a form from the dashboard itself counts.
  // The page is served with Referrer-Policy: no-referrer, so the browser sends Origin: null on its
  // own form; Sec-Fetch-Site (set by the browser, a page cannot forge it) still says same-origin.
  const sameSite = req.headers.get("Sec-Fetch-Site") === "same-origin" || req.headers.get("Origin") === new URL(req.url).origin;
  if (!sameSite) return new Response("forbidden", { status: 403 });
  const id = Number((await req.formData().catch(() => null))?.get("dismiss"));
  if (!Number.isInteger(id) || id <= 0) return new Response("bad id", { status: 400 });
  await env.DB.prepare("INSERT OR IGNORE INTO dismissed (id, ts) VALUES (?, ?)").bind(id, Date.now()).run();
  return new Response(null, { status: 303, headers: { Location: "/dashboard?tab=sicurezza", "Cache-Control": "no-store" } });
}

const html = (doc: string) => new Response(doc, {
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" },
});
