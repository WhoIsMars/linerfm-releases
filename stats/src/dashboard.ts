// GET /dashboard: the owner's private view of the site numbers, last 30 days.
// HTTP Basic auth against the DASH_PASSWORD secret (`wrangler secret put DASH_PASSWORD`);
// without the secret the page stays closed. Nothing is cached or indexed.
export interface Env { DB: D1Database; DASH_PASSWORD?: string; LS_API_KEY?: string; LS_STORE_ID?: string }

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
    recent: downloads.slice(-15).reverse().map((r) => ({ ts: r.ts, arch: r.arch, from: from(r.sid), country: r.country })),
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

// ── Vendite vere, da Lemon Squeezy (chiave in sola lettura, secret LS_API_KEY) ──
export async function readSales(fetchImpl: typeof fetch, apiKey: string | undefined, storeId: string) {
  if (!apiKey) return null;
  try {
    const out = { paid: 0, cents: 0, currency: "EUR", last: "", refunded: 0 };
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
        out.paid++; out.cents += a.total; out.currency = a.currency;
        if (a.created_at > out.last) out.last = a.created_at;
      }
    }
    return out;
  } catch { return null; }
}

const ROME = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const rome = (ts: number) => (ts ? ROME.format(new Date(ts)) : "mai");
const COUNTRY = new Intl.DisplayNames(["it"], { type: "region" });
const countryName = (c: string) => { try { return c && c !== "?" ? COUNTRY.of(c) ?? c : "Sconosciuto"; } catch { return c || "Sconosciuto"; } };
const money = (cents: number, cur: string) => new Intl.NumberFormat("it-IT", { style: "currency", currency: cur || "EUR" }).format(cents / 100);
const ago = (ts: number, now: number) => {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "adesso"; if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60); if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  const d = Math.round(h / 24); return `${d} ${d === 1 ? "giorno" : "giorni"} fa`;
};

/** Il traffico di prova dell'owner e di Claude non è traffico. */
const TEST_SOURCES = new Set(["verifica", "test", "claude"]);

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

const REASON: Record<string, string> = {
  invalid: "chiave non valida", activation_limit: "limite di Mac raggiunto", wrong_product: "chiave di un altro prodotto",
  refunded: "ordine rimborsato", disabled: "licenza disabilitata", device_mismatch: "chiave usata su un altro Mac",
  bad_device: "identificativo del Mac non valido", rate_limited: "troppi reset oggi", inactive: "non attiva", expired: "scaduta",
};
const reasonText = (r: string) => REASON[r] ?? r;

function eventLine(r: AccessRow): { tone: string; title: string; detail: string } {
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

function page(s: ReturnType<typeof summarize>, x: ReturnType<typeof summarizeAccess>, sales: Sales, gh: [string, number][] | null, now: number): string {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "");
  const trialsTotal = x.trialing + x.expiredBack;
  const salesN = sales ? sales.paid : x.sales.length;
  const steps = [
    { label: "Visite al sito", value: s.visits, note: "30 giorni" },
    { label: "Click sul download", value: s.downloads, note: pct(s.downloads, s.visits) },
    { label: "Mac che hanno aperto l'app", value: trialsTotal, note: "dal 17/10" },
    { label: "Vendite", value: salesN, note: sales ? `${money(sales.cents, sales.currency)} in tutto` : "da Lemon Squeezy non leggibile", tone: "ok" },
  ];
  const funnel = steps.map((st, i) => `<div class="step${st.tone ? " " + st.tone : ""}"><span class="lbl">${esc(st.label)}</span><b>${esc(st.value)}</b><span class="note">${esc(st.note)}</span>${i < steps.length - 1 ? '<i class="arrow" aria-hidden="true">›</i>' : ""}</div>`).join("");

  const refusedNow = x.recent.filter((r) => r.outcome === "refused" && now - r.ts < DAY).length;
  const health = refusedNow
    ? `<span class="pill bad">${refusedNow} ${refusedNow === 1 ? "rifiuto" : "rifiuti"} nelle ultime 24 ore</span>`
    : `<span class="pill ok">Licenze: nessun rifiuto nelle ultime 24 ore</span>`;

  const feed = x.recent.length
    ? `<ul class="feed">${x.recent.slice(0, 25).map((r) => { const e = eventLine(r); return `<li class="${e.tone}" title="${esc(r.reason)}"><i class="dot"></i><div><b>${esc(e.title)}</b><span>${esc(e.detail)}${r.country ? ` · ${esc(countryName(r.country))}` : ""}</span></div><time title="${esc(rome(r.ts))}">${esc(ago(r.ts, now))}</time></li>`; }).join("")}</ul>`
    : `<p class="empty">Nessun accesso registrato negli ultimi 30 giorni. Il registro è attivo dal 17/10: prove, attivazioni e controlli compaiono qui appena succedono.</p>`;

  const licenses = x.licenses.length
    ? `<ul class="rows">${x.licenses.map((l) => { const live = now - l.lastOk < 2 * DAY; return `<li><span class="mono">····${esc(l.key)}</span><span class="tag ${live ? "ok" : l.lastRefused ? "bad" : ""}">${live ? "attiva" : l.lastRefused ? "rifiutata" : "silenziosa"}</span><span class="muted">${esc(l.macs)} Mac · ultimo controllo ${esc(ago(l.lastOk, now))}</span>${l.lastRefused ? `<span class="muted bad">rifiuto: ${esc(reasonText(l.lastRefused.reason))}</span>` : ""}</li>`; }).join("")}</ul>`
    : `<p class="empty">Nessuna licenza ha ancora contattato il server dal 17/10.</p>`;

  const maxV = Math.max(1, ...s.days.map((d) => d.visits));
  const bars = s.days.map((d, i) => `<div class="col" title="${esc(d.day.slice(8))}/${esc(d.day.slice(5, 7))}: ${d.visits} visite, ${d.downloads} download"><i class="v" style="height:${Math.round((d.visits / maxV) * 100)}%"></i>${d.downloads ? `<i class="d" style="height:${Math.round((d.downloads / maxV) * 100)}%"></i>` : ""}${i % 5 === 4 || i === s.days.length - 1 ? `<span>${esc(d.day.slice(8))}/${esc(d.day.slice(5, 7))}</span>` : ""}</div>`).join("");

  const barList = (items: [string, number][], total: number) => items.length
    ? `<ul class="bars">${items.map(([k, n]) => `<li><span>${esc(k)}</span><i style="width:${Math.max(4, Math.round((n / Math.max(1, total)) * 100))}%"></i><b>${esc(n)}</b></li>`).join("")}</ul>`
    : `<p class="empty">Ancora nessuna visita.</p>`;
  const sources = barList(s.bySource.map(([k, v, d]) => [`${prettySource(k)}${d ? ` · ${d} download` : ""}`, v]), s.visits);
  const countries = barList(s.countries.map(([c, n]) => [countryName(c), n]), s.visits);

  const archName = (a: string) => (a === "apple-silicon" ? "Apple Silicon" : a === "intel" ? "Intel" : a === "github-page" ? "pagina GitHub" : a);
  const downloads = s.recent.length
    ? `<ul class="rows">${s.recent.map((r) => `<li><b>${esc(archName(r.arch))}</b><span class="muted">da ${esc(prettySource(r.from))} · ${esc(countryName(r.country))}</span><time>${esc(rome(r.ts))}</time></li>`).join("")}</ul>`
    : `<p class="empty">Nessun download dal sito negli ultimi 30 giorni.</p>`;
  const ghTotal = gh ? gh.reduce((n, [, c]) => n + c, 0) : 0;
  const github = gh
    ? `<p class="big">${esc(ghTotal)} <span class="muted">download DMG nelle ultime ${esc(gh.length)} release</span></p>${gh.filter(([, c]) => c > 0).length ? `<ul class="chips">${gh.filter(([, c]) => c > 0).map(([t, c]) => `<li>${esc(t)} <b>${esc(c)}</b></li>`).join("")}</ul>` : ""}`
    : `<p class="empty">GitHub non raggiungibile in questo momento.</p>`;

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>LinerFM, numeri</title><style>
:root{color-scheme:dark;--bg:#050505;--panel:rgba(255,255,255,.04);--panel-2:rgba(255,255,255,.06);--line:rgba(255,255,255,.1);--line-2:rgba(255,255,255,.06);
--shadow:0 8px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);--text:#f5f5f7;--text-2:rgba(235,235,245,.72);--text-3:rgba(235,235,245,.6);
--green:#1db954;--red:#ff6b6b;--amber:#e0a955;--r:14px;--r-sm:10px}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;color:var(--text);font:13px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-.011em}
main{max-width:1120px;margin:0 auto;padding:32px 16px 72px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:24px}
h1{font:700 28px/1.1 -apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;letter-spacing:-.025em;margin:0}
.sub{color:var(--text-3);font-size:12px;margin-top:6px}
h2{font-size:13px;font-weight:600;color:var(--text-2);margin:0 0 14px;letter-spacing:0}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:18px}
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:500;background:var(--panel-2);border:1px solid var(--line)}
.pill::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.pill.ok{color:var(--green)}.pill.bad{color:var(--red)}
.funnel{display:grid;grid-template-columns:repeat(4,1fr);gap:0;padding:0;overflow:hidden}
.step{position:relative;padding:18px 20px;border-right:1px solid var(--line-2)}.step:last-child{border-right:0}
.step .lbl{display:block;color:var(--text-2);font-size:12px}.step b{display:block;font:650 34px/1.1 -apple-system,"SF Pro Display",sans-serif;letter-spacing:-.02em;margin:6px 0 4px;font-variant-numeric:tabular-nums}
.step .note{color:var(--text-3);font-size:12px}.step.ok b{color:var(--green)}
.arrow{position:absolute;right:-9px;top:50%;transform:translateY(-50%);width:18px;height:18px;border-radius:50%;background:#111113;border:1px solid var(--line);color:var(--text-3);font-style:normal;font-size:13px;display:grid;place-items:center;z-index:1}
.grid{display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-top:14px}.grid.even{grid-template-columns:1fr 1fr}
@media(max-width:820px){.funnel{grid-template-columns:1fr 1fr}.step:nth-child(2){border-right:0}.step:nth-child(-n+2){border-bottom:1px solid var(--line-2)}.arrow{display:none}.grid,.grid.even{grid-template-columns:1fr}}
.feed,.rows,.bars,.chips{list-style:none;margin:0;padding:0}
.feed li{display:grid;grid-template-columns:10px 1fr auto;gap:12px;align-items:start;padding:10px 0;border-top:1px solid var(--line-2)}.feed li:first-child{border-top:0;padding-top:2px}
.feed .dot{width:8px;height:8px;border-radius:50%;background:var(--text-3);margin-top:5px}.feed li.ok .dot{background:var(--green)}.feed li.bad .dot{background:var(--red)}.feed li.warn .dot{background:var(--amber)}
.feed b{display:block;font-weight:550}.feed span{color:var(--text-3);font-size:12px}.feed time,.rows time{color:var(--text-3);font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}
.rows li{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;padding:10px 0;border-top:1px solid var(--line-2)}.rows li:first-child{border-top:0;padding-top:2px}.rows time{margin-left:auto}
.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12px}.muted{color:var(--text-3);font-size:12px}.muted.bad{color:var(--red)}
.tag{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--panel-2);color:var(--text-2)}.tag.ok{color:var(--green)}.tag.bad{color:var(--red)}
.chart{display:flex;gap:4px;align-items:flex-end;height:120px;margin-bottom:22px}
.col{flex:1;height:100%;position:relative;display:flex;align-items:flex-end}.col .v{display:block;width:100%;background:rgba(235,235,245,.22);border-radius:4px 4px 1px 1px;min-height:2px}
.col .d{position:absolute;left:25%;width:50%;bottom:0;background:var(--green);border-radius:3px 3px 0 0}.col span{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--text-3);white-space:nowrap}
.legend{display:flex;gap:14px;color:var(--text-3);font-size:12px;margin:-6px 0 12px}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:rgba(235,235,245,.22)}.legend i.d{background:var(--green)}
.bars li{display:grid;grid-template-columns:minmax(110px,1.2fr) 2fr 28px;gap:10px;align-items:center;padding:6px 0}.bars span{color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bars i{display:block;height:8px;border-radius:4px;background:rgba(235,235,245,.28)}.bars b{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.big{font:650 24px/1.2 -apple-system,"SF Pro Display",sans-serif;margin:0 0 12px}.big .muted{font:400 12px/1 inherit}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips li{background:var(--panel-2);border:1px solid var(--line-2);border-radius:999px;padding:3px 10px;font-size:12px;color:var(--text-2)}.chips b{color:var(--text);margin-left:4px}
.empty{color:var(--text-3);margin:0;padding:6px 0;line-height:1.5}.note-foot{color:var(--text-3);font-size:12px;margin:18px 2px 0;line-height:1.5}
</style></head><body><main>
<header><div><h1>LinerFM</h1><div class="sub">Aggiornato ${esc(rome(now))}, ora di Roma · ultimi 30 giorni</div></div>${health}</header>

<section class="panel funnel" aria-label="Percorso">${funnel}</section>
<p class="note-foot" style="margin-top:8px">Percorso: chi arriva al sito, chi scarica, chi apre l'app, chi compra.</p>

<div class="grid">
  <section class="panel"><h2>Accessi all'app</h2>${feed}</section>
  <section class="panel"><h2>Licenze</h2>${licenses}
    <h2 style="margin-top:22px">Prove</h2><ul class="rows"><li><b>${esc(x.trialing)}</b><span class="muted">Mac in prova adesso</span></li><li><b>${esc(x.expiredBack)}</b><span class="muted">prove finite che hanno riaperto l'app (bloccata)</span></li><li><b class="${x.refused7d ? "muted bad" : ""}">${esc(x.refused7d)}</b><span class="muted">rifiuti negli ultimi 7 giorni</span></li></ul>
  </section>
</div>

<section class="panel" style="margin-top:14px"><h2>Visite al sito, giorno per giorno</h2><div class="legend"><span><i></i>visite</span><span><i class="d"></i>download</span><span>massimo ${esc(maxV)} al giorno</span></div><div class="chart">${bars}</div></section>

<div class="grid even">
  <section class="panel"><h2>Da dove arrivano</h2>${sources}</section>
  <section class="panel"><h2>Paesi</h2>${countries}</section>
</div>
<div class="grid even">
  <section class="panel"><h2>Ultimi download dal sito</h2>${downloads}</section>
  <section class="panel"><h2>Download su GitHub</h2>${github}</section>
</div>
<p class="note-foot">Il traffico di prova è escluso. Il tuo browser non si conta se apri il sito con ?notrack=1. Le prove si contano per Mac: finché il worker non controlla l'identificativo, una chiamata inventata può creare una prova finta.</p>
</main></body></html>`;
}

export async function handleDashboard(req: Request, env: Env, now: number, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.DASH_PASSWORD) return new Response("dashboard closed: DASH_PASSWORD not set", { status: 503 });
  if (!authorized(req, env.DASH_PASSWORD)) {
    return new Response("password required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LinerFM stats", charset="UTF-8"', "Cache-Control": "no-store" } });
  }
  const since = now - 30 * DAY;
  const [hits, access, gh, sales] = await Promise.all([
    env.DB.prepare("SELECT ts, kind, ref, src, arch, sid, country FROM hits WHERE ts > ? ORDER BY ts").bind(since).all<Row>(),
    env.DB.prepare("SELECT ts, kind, outcome, reason, device, key, country FROM access WHERE ts > ? ORDER BY ts").bind(since).all<AccessRow>()
      .catch(() => ({ results: [] as AccessRow[] })),
    githubDownloads(fetchImpl),
    readSales(fetchImpl, env.LS_API_KEY, env.LS_STORE_ID ?? "406309"),
  ]);
  const real = (hits.results ?? []).filter((r) => !TEST_SOURCES.has(r.src));
  return new Response(page(summarize(real, now), summarizeAccess(access.results ?? [], now), sales, gh, now), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" },
  });
}
