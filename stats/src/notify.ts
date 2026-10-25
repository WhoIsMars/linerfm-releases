// Notifiche Discord del sito, ognuna sul suo canale:
//   #downloads → un click sul DMG appena arriva (POST /hit), una volta per visitatore al giorno
//   #metrics   → riepilogo ogni 6 ore dal cron (scheduled): sito, GitHub, app, vendite
// I numeri social non stanno qui: si leggono solo dal Mac (sessione IG, token TikTok),
// li manda ~/LinerFM-Social/bin/metrics.mjs sullo stesso canale.
import { TEST_SOURCES, prettySource, countryName, flag, money, osSplit, osByDevice, type Row, type AccessRow } from "./dashboard";
import { loadGithub, readOrders, type GhRelease, type Order } from "./admin";

const H = 3_600_000;
const DAY = 24 * H;
const DOWNLOADS_PER_HOUR = 20;
const LEAD_DAYS = 30;
const ICON = "https://linerfm.xyz/icon-512.png";

export interface NotifyEnv { DB: D1Database; DISCORD_DOWNLOADS_WEBHOOK?: string; DISCORD_METRICS_WEBHOOK?: string; LS_API_KEY?: string; LS_STORE_ID?: string }

export interface Embed {
  author: { name: string; icon_url: string }; title: string; description: string; color: number;
  fields: { name: string; value: string; inline?: boolean }[]; thumbnail: { url: string }; footer: { text: string; icon_url: string }; timestamp: string;
}

const card = (title: string, description: string, color: number, fields: Embed["fields"], ts: number, footer: string): Embed => ({
  author: { name: "LinerFM", icon_url: ICON }, title, description, color, fields,
  thumbnail: { url: ICON }, footer: { text: footer, icon_url: ICON }, timestamp: new Date(ts).toISOString(),
});
const when = (ts: number) => { const s = Math.floor(ts / 1000); return `<t:${s}:F> (<t:${s}:R>)`; };
// Intl mette uno spazio non separabile prima di €: su Discord e nei test basta quello normale
const eur = (cents: number, cur: string) => money(cents, cur).replace(/ /g, " ");

async function post(url: string, embed: Embed, fetchImpl: typeof fetch): Promise<void> {
  await fetchImpl(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "LinerFM", avatar_url: ICON, embeds: [embed], allowed_mentions: { parse: [] } }),
  });
}

// ── #downloads ──

const ARCH: Record<string, string> = { "apple-silicon": "Apple silicon", intel: "Intel", windows: "Windows", "github-page": "Pagina GitHub" };

export function downloadEmbed(h: { ts: number; arch: string; src: string; ref: string; country: string }): Embed {
  const fields: Embed["fields"] = [
    { name: "Sistema", value: ARCH[h.arch] ?? (h.arch || "?"), inline: true },
    { name: "Da dove", value: prettySource(h.src || h.ref || "diretto"), inline: true },
  ];
  if (h.country) fields.push({ name: "Paese", value: `${flag(h.country)} ${countryName(h.country)}`, inline: true });
  fields.push({ name: "Quando", value: when(h.ts) });
  return card("Download dal sito", "Qualcuno ha premuto un pulsante di download di LinerFM.", 0x1db954, fields, h.ts, "LinerFM sito");
}

/** Dopo la risposta: annuncia il click se è il primo del visitatore oggi e il canale non è saturo. */
export async function announceDownload(env: NotifyEnv, h: { ts: number; arch: string; src: string; ref: string; sid: string; country: string }, fetchImpl: typeof fetch): Promise<void> {
  if (!env.DISCORD_DOWNLOADS_WEBHOOK || TEST_SOURCES.has(h.src)) return;
  try {
    const prior = await env.DB.prepare("SELECT COUNT(*) AS n FROM hits WHERE kind = 'download' AND sid = ? AND ts > ? AND ts < ?")
      .bind(h.sid, h.ts - DAY, h.ts).first<{ n: number }>();
    if ((prior?.n ?? 0) > 0) return;
    const hour = await env.DB.prepare("SELECT COUNT(*) AS n FROM hits WHERE kind = 'download' AND ts > ? AND ts < ?")
      .bind(h.ts - H, h.ts).first<{ n: number }>();
    if ((hour?.n ?? 0) >= DOWNLOADS_PER_HOUR) return;
    await post(env.DISCORD_DOWNLOADS_WEBHOOK, downloadEmbed(h), fetchImpl);
  } catch { /* una notifica persa non deve rompere il conteggio */ }
}

// ── #metrics ──

/** Le 6 ore che finiscono sul tick del cron (00, 06, 12, 18 UTC), non "6 ore fa da adesso". */
export function windowOf(scheduledTime: number): { from: number; to: number } {
  const to = Math.floor(scheduledTime / (6 * H)) * 6 * H;
  return { from: to - 6 * H, to };
}

const ROME_HM = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export interface GhTotals { dmg: number; win?: number; updates: number }
export function ghTotals(list: GhRelease[]): GhTotals {
  const n = (re: RegExp) => list.reduce((s, r) => s + r.assets.filter((a) => re.test(a.name)).reduce((t, a) => t + a.download_count, 0), 0);
  return { dmg: n(/\.dmg$/), win: n(/-setup\.exe$/), updates: n(/\.app\.tar\.gz$/) };
}

type SaleRow = Pick<Order, "ts" | "cents" | "currency" | "state">;
export interface SummaryInput {
  win: { from: number; to: number }; hits: Row[]; access: AccessRow[]; gh: GhTotals | null; ghPrev: GhTotals | null; orders: SaleRow[] | null;
  /** Email lasciate da telefono (tabella leads, src/lead.ts); null se la tabella non si legge. */
  leads?: { ts: number; src: string }[] | null;
}

export function summaryEmbed(x: SummaryInput): Embed {
  const inWin = (ts: number) => ts > x.win.from && ts <= x.win.to;
  const hits = x.hits.filter((r) => inWin(r.ts) && !TEST_SOURCES.has(r.src));
  const views = hits.filter((r) => r.kind === "view");
  // da telefono il pulsante scarica un file che il telefono non apre: non è un download vero
  const phoneDownloads = new Set(hits.filter((r) => r.kind === "download" && r.client === "mobile").map((r) => r.sid));
  const downloads = new Set(hits.filter((r) => r.kind === "download" && r.client !== "mobile").map((r) => r.sid));
  const phones = new Set(views.filter((r) => r.client === "mobile").map((r) => r.sid));
  const sources = new Map<string, Set<string>>();
  for (const v of views) {
    const s = prettySource(v.src || v.ref || "diretto");
    if (!sources.has(s)) sources.set(s, new Set());
    sources.get(s)!.add(v.sid);
  }
  const top = [...sources].map(([s, ids]) => [s, ids.size] as const).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const access = x.access.filter((r) => inWin(r.ts));
  const ok = access.filter((r) => r.outcome !== "refused" && r.device);
  const newTrials = access.filter((r) => r.kind === "trial" && r.outcome === "new");
  const os = osByDevice(access);
  // "3 (2 Mac, 1 Windows)": il numero, poi la divisione per sistema quando c'è qualcosa da dividere
  const split = (devices: string[]) => (devices.length ? `${devices.length} (${osSplit(devices.map((d) => os.get(d) ?? ""))})` : "0");

  const delta = (cur: number, prev: number | undefined) => (prev === undefined ? `totale ${cur}` : `+${Math.max(0, cur - prev)} (totale ${cur})`);
  const sales = (list: SaleRow[]) => {
    const paid = list.filter((o) => o.state === "pagato");
    return `${paid.length} (${eur(paid.reduce((s, o) => s + o.cents, 0), paid[0]?.currency ?? "EUR")})`;
  };

  const leadsText = (list: { ts: number; src: string }[]) => {
    const inside = list.filter((l) => inWin(l.ts));
    if (!inside.length) return "0";
    const by = new Map<string, number>();
    for (const l of inside) { const k = prettySource(l.src || "diretto"); by.set(k, (by.get(k) ?? 0) + 1); }
    return `${inside.length} (${[...by].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")})`;
  };

  const fields: Embed["fields"] = [
    { name: "Visite sito", value: `${views.length} (${new Set(views.map((v) => v.sid)).size} persone${phones.size ? `, ${phones.size} da telefono o tablet` : ""})`, inline: true },
    { name: "Persone che hanno scaricato", value: `${downloads.size}${phoneDownloads.size ? ` (+${phoneDownloads.size} da telefono, che non installa)` : ""}`, inline: true },
    { name: "Fonti", value: top.length ? top.map(([s, n]) => `${s} ${n}`).join(", ") : "nessuna", inline: true },
    { name: "DMG scaricati", value: x.gh ? delta(x.gh.dmg, x.ghPrev?.dmg) : "GitHub non leggibile", inline: true },
    { name: "Installer Windows", value: x.gh ? delta(x.gh.win ?? 0, x.ghPrev?.win) : "?", inline: true },
    { name: "Aggiornamenti", value: x.gh ? (x.ghPrev ? `+${Math.max(0, x.gh.updates - x.ghPrev.updates)}` : `totale ${x.gh.updates}`) : "?", inline: true },
    { name: "Prove nuove", value: split(newTrials.map((r) => r.device)), inline: true },
    { name: "Computer attivi", value: split([...new Set(ok.map((r) => r.device))]), inline: true },
    { name: "Rifiuti", value: String(access.filter((r) => r.outcome === "refused").length), inline: true },
    { name: "Vendite", value: x.orders ? sales(x.orders.filter((o) => inWin(o.ts))) : "non leggibili", inline: true },
    { name: "Totale vendite", value: x.orders ? sales(x.orders) : "?", inline: true },
    // dal 25/10 il link parte da solo (Resend); quelli non partiti li elenca scripts/leads.mjs
    { name: "Email da telefono", value: x.leads === undefined ? "0" : x.leads === null ? "non leggibili" : leadsText(x.leads), inline: true },
  ];
  const title = `Numeri ${ROME_HM.format(new Date(x.win.from))} → ${ROME_HM.format(new Date(x.win.to))}`;
  return card(title, "Ultime 6 ore. Download GitHub e aggiornamenti: differenza dal riepilogo precedente.", 0x0a84ff, fields, x.win.to, "LinerFM numeri");
}

/** Il cron: legge tutto, manda un riepilogo, salva il totale GitHub per la differenza della volta dopo. */
export async function handleScheduled(env: NotifyEnv, scheduledTime: number, fetchImpl: typeof fetch = fetch): Promise<void> {
  // Le email da telefono restano al massimo 30 giorni (pagina privacy del sito), con o senza Discord.
  await env.DB.prepare("DELETE FROM leads WHERE ts < ?").bind(scheduledTime - LEAD_DAYS * DAY).run().catch(() => undefined);
  if (!env.DISCORD_METRICS_WEBHOOK) return;
  const win = windowOf(scheduledTime);
  const all = <T>(sql: string) => env.DB.prepare(sql).bind(win.from).all<T>().then((r) => r.results ?? []).catch(() => [] as T[]);
  const [hits, access, gh, orders, prevRow, leads] = await Promise.all([
    // senza la migrazione 0003_hits_client.sql la colonna client non c'è: si rilegge senza
    all<Row>("SELECT ts, kind, ref, src, arch, sid, country, client FROM hits WHERE ts > ?")
      .then((r) => (r.length ? r : all<Row>("SELECT ts, kind, ref, src, arch, sid, country FROM hits WHERE ts > ?"))),
    // senza la migrazione 0001_access_os.sql la colonna os non c'è: si rilegge senza, e ogni computer resta "non noto"
    env.DB.prepare("SELECT ts, kind, outcome, reason, device, key, country, os FROM access WHERE ts > ?").bind(win.from).all<AccessRow>()
      .catch(() => env.DB.prepare("SELECT ts, kind, outcome, reason, device, key, country FROM access WHERE ts > ?").bind(win.from).all<AccessRow>())
      .then((r) => (r.results ?? []).map((x) => ({ ...x, os: x.os ?? "" }))).catch(() => [] as AccessRow[]),
    loadGithub(fetchImpl).then(ghTotals).catch(() => null),
    readOrders(fetchImpl, env.LS_API_KEY, env.LS_STORE_ID ?? "406309"),
    env.DB.prepare("SELECT ts, value FROM cache WHERE k = ?").bind("summary-gh").first<{ value: string }>().catch(() => null),
    // senza la migrazione 0002_leads.sql la tabella non c'è: "non leggibili", il resto del riepilogo parte lo stesso
    env.DB.prepare("SELECT ts, src FROM leads WHERE ts > ?").bind(win.from).all<{ ts: number; src: string }>().then((r) => r.results ?? []).catch(() => null),
  ]);
  let ghPrev: GhTotals | null = null;
  try { ghPrev = prevRow ? (JSON.parse(prevRow.value) as GhTotals) : null; } catch { /* copia rovinata: si riparte dal totale */ }
  await post(env.DISCORD_METRICS_WEBHOOK, summaryEmbed({ win, hits, access, gh, ghPrev, orders, leads }), fetchImpl);
  if (gh) {
    await env.DB.prepare("INSERT OR REPLACE INTO cache (k, ts, value) VALUES (?, ?, ?)").bind("summary-gh", win.to, JSON.stringify(gh)).run().catch(() => undefined);
  }
}
