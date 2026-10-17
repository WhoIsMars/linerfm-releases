// Notifiche Discord del sito, ognuna sul suo canale:
//   #downloads → un click sul DMG appena arriva (POST /hit), una volta per visitatore al giorno
//   #metrics   → riepilogo ogni 6 ore dal cron (scheduled): sito, GitHub, app, vendite
// I numeri social non stanno qui: si leggono solo dal Mac (sessione IG, token TikTok),
// li manda ~/LinerFM-Social/bin/metrics.mjs sullo stesso canale.
import { TEST_SOURCES, prettySource, countryName, flag, money, type Row, type AccessRow } from "./dashboard";
import { loadGithub, readOrders, type GhRelease, type Order } from "./admin";

const H = 3_600_000;
const DAY = 24 * H;
const DOWNLOADS_PER_HOUR = 20;
const ICON = "https://whoismars.github.io/linerfm-releases/icon-512.png";

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

const ARCH: Record<string, string> = { "apple-silicon": "Apple silicon", intel: "Intel", "github-page": "Pagina GitHub" };

export function downloadEmbed(h: { ts: number; arch: string; src: string; ref: string; country: string }): Embed {
  const fields: Embed["fields"] = [
    { name: "Mac", value: ARCH[h.arch] ?? (h.arch || "?"), inline: true },
    { name: "Da dove", value: prettySource(h.src || h.ref || "diretto"), inline: true },
  ];
  if (h.country) fields.push({ name: "Paese", value: `${flag(h.country)} ${countryName(h.country)}`, inline: true });
  fields.push({ name: "Quando", value: when(h.ts) });
  return card("Download dal sito", "Qualcuno ha cliccato sul DMG di LinerFM.", 0x1db954, fields, h.ts, "LinerFM sito");
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

export interface GhTotals { dmg: number; updates: number }
export function ghTotals(list: GhRelease[]): GhTotals {
  const n = (re: RegExp) => list.reduce((s, r) => s + r.assets.filter((a) => re.test(a.name)).reduce((t, a) => t + a.download_count, 0), 0);
  return { dmg: n(/\.dmg$/), updates: n(/\.app\.tar\.gz$/) };
}

type SaleRow = Pick<Order, "ts" | "cents" | "currency" | "state">;
export interface SummaryInput { win: { from: number; to: number }; hits: Row[]; access: AccessRow[]; gh: GhTotals | null; ghPrev: GhTotals | null; orders: SaleRow[] | null }

export function summaryEmbed(x: SummaryInput): Embed {
  const inWin = (ts: number) => ts > x.win.from && ts <= x.win.to;
  const hits = x.hits.filter((r) => inWin(r.ts) && !TEST_SOURCES.has(r.src));
  const views = hits.filter((r) => r.kind === "view");
  const downloads = new Set(hits.filter((r) => r.kind === "download").map((r) => r.sid));
  const sources = new Map<string, Set<string>>();
  for (const v of views) {
    const s = prettySource(v.src || v.ref || "diretto");
    if (!sources.has(s)) sources.set(s, new Set());
    sources.get(s)!.add(v.sid);
  }
  const top = [...sources].map(([s, ids]) => [s, ids.size] as const).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const access = x.access.filter((r) => inWin(r.ts));
  const ok = access.filter((r) => r.outcome !== "refused" && r.device);
  const newTrials = access.filter((r) => r.kind === "trial" && r.outcome === "new").length;

  const delta = (cur: number, prev: number | undefined) => (prev === undefined ? `totale ${cur}` : `+${Math.max(0, cur - prev)} (totale ${cur})`);
  const sales = (list: SaleRow[]) => {
    const paid = list.filter((o) => o.state === "pagato");
    return `${paid.length} (${eur(paid.reduce((s, o) => s + o.cents, 0), paid[0]?.currency ?? "EUR")})`;
  };

  const fields: Embed["fields"] = [
    { name: "Visite sito", value: `${views.length} (${new Set(views.map((v) => v.sid)).size} persone)`, inline: true },
    { name: "Click download", value: String(downloads.size), inline: true },
    { name: "Fonti", value: top.length ? top.map(([s, n]) => `${s} ${n}`).join(", ") : "nessuna", inline: true },
    { name: "DMG scaricati", value: x.gh ? delta(x.gh.dmg, x.ghPrev?.dmg) : "GitHub non leggibile", inline: true },
    { name: "Aggiornamenti", value: x.gh ? (x.ghPrev ? `+${Math.max(0, x.gh.updates - x.ghPrev.updates)}` : `totale ${x.gh.updates}`) : "?", inline: true },
    { name: "Prove nuove", value: String(newTrials), inline: true },
    { name: "Mac attivi", value: String(new Set(ok.map((r) => r.device)).size), inline: true },
    { name: "Rifiuti", value: String(access.filter((r) => r.outcome === "refused").length), inline: true },
    { name: "Vendite", value: x.orders ? sales(x.orders.filter((o) => inWin(o.ts))) : "non leggibili", inline: true },
    { name: "Totale vendite", value: x.orders ? sales(x.orders) : "?", inline: true },
  ];
  const title = `Numeri ${ROME_HM.format(new Date(x.win.from))} → ${ROME_HM.format(new Date(x.win.to))}`;
  return card(title, "Ultime 6 ore. Download GitHub e aggiornamenti: differenza dal riepilogo precedente.", 0x0a84ff, fields, x.win.to, "LinerFM numeri");
}

/** Il cron: legge tutto, manda un riepilogo, salva il totale GitHub per la differenza della volta dopo. */
export async function handleScheduled(env: NotifyEnv, scheduledTime: number, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!env.DISCORD_METRICS_WEBHOOK) return;
  const win = windowOf(scheduledTime);
  const all = <T>(sql: string) => env.DB.prepare(sql).bind(win.from).all<T>().then((r) => r.results ?? []).catch(() => [] as T[]);
  const [hits, access, gh, orders, prevRow] = await Promise.all([
    all<Row>("SELECT ts, kind, ref, src, arch, sid, country FROM hits WHERE ts > ?"),
    all<AccessRow>("SELECT ts, kind, outcome, reason, device, key, country FROM access WHERE ts > ?"),
    loadGithub(fetchImpl).then(ghTotals).catch(() => null),
    readOrders(fetchImpl, env.LS_API_KEY, env.LS_STORE_ID ?? "406309"),
    env.DB.prepare("SELECT ts, value FROM cache WHERE k = ?").bind("summary-gh").first<{ value: string }>().catch(() => null),
  ]);
  let ghPrev: GhTotals | null = null;
  try { ghPrev = prevRow ? (JSON.parse(prevRow.value) as GhTotals) : null; } catch { /* copia rovinata: si riparte dal totale */ }
  await post(env.DISCORD_METRICS_WEBHOOK, summaryEmbed({ win, hits, access, gh, ghPrev, orders }), fetchImpl);
  if (gh) {
    await env.DB.prepare("INSERT OR REPLACE INTO cache (k, ts, value) VALUES (?, ?, ?)").bind("summary-gh", win.to, JSON.stringify(gh)).run().catch(() => undefined);
  }
}
