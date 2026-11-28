// Numeri della dashboard (/dashboard e pagina di casa ~/LinerFM-Social/review): le schede della vecchia
// dashboard ricalcolate da dati grezzi con le stesse funzioni, stessi filtri e stessi tagli (30 giorni, senza
// traffico di prova). Testi in codici: l'inglese lo mette la pagina. Fonte unica: la pagina di casa la usa
// tramite review/vendor/stats-lib.mjs (build-stats-lib.sh), e overview.test.mjs la confronta con le schede tab*.
import * as W from "./dashboard";
import * as A from "./admin";
import type { AccessRow, Row } from "./dashboard";
import type { DeviceRow, GhRelease, LedgerEntry, Order, SocialRow } from "./admin";

/** Passi del primo avvio (tabella first_run del D1, scritta dal worker licenze): una riga per computer e passo. */
export interface FirstRunRow { device: string; step: string; secs: number; ts: number; os: string; country: string }
export interface Raw { hits: Row[]; access: AccessRow[]; devices: DeviceRow[]; social: SocialRow[]; ledger: LedgerEntry[]; orders: Order[] | null; gh: GhRelease[] | null; firstRun?: FirstRunRow[] }
const Wx = { ...W, ...A };

const DAY = 864e5, H = 36e5;
const osCount = (list: string[]) => ({ macos: list.filter((o) => o === "macos").length, windows: list.filter((o) => o === "windows").length,
  unknown: list.filter((o) => o !== "macos" && o !== "windows").length });
const name = (src: string) => { const n = Wx.prettySource(src); return n === "Diretto o sconosciuto" ? "Direct or unknown" : n; };
const person = (p: W.Session) => ({ ts: p.firstClick, last: p.last, arches: p.arches, from: name(p.from), country: p.country, clicks: p.clicks,
  minutes: Math.max(1, Math.round((p.lastClick - p.firstClick) / 60000)) });
const accessOut = (r: AccessRow) => ({ id: r.id, ts: r.ts, kind: r.kind, outcome: r.outcome, reason: r.reason, device: r.device, key: r.key, country: r.country, os: r.os, tone: Wx.eventLine(r).tone });

// I passi mostrati in "Downloaded, not bought", nell'ordine del primo avvio (nomi di usage.rs STEPS).
const FUNNEL = ["launch", "track", "widget_shown", "main_window", "desktop_on", "alive_10m", "alive_30m", "second_launch", "buy_click"];
const OWN_DEVICES = new Set(["8a995069"]);  // server Windows di prova dell'owner (Hetzner)
const STILL = 3 * DAY;                      // visto negli ultimi 3 giorni: non ha ancora smesso

/** Chi apre l'app e non compra (la prova non c'è più dalla 1.7.2, 19/11/2026). Coorte: computer visti la prima volta
 * negli ultimi 30 giorni, senza licenza; le prove vere ancora in corso (ultimo controllo "active") vanno a parte. */
/** Ultimo esito del controllo all'avvio per computer: "active" solo per una prova vera ancora in corso (dalla 1.7.2 non ne nascono più). */
function lastTrialOf(access: AccessRow[]) {
  const m = new Map<string, string>();
  for (const r of access) if (r.kind === "trial" && r.device && r.outcome !== "refused") m.set(r.device, r.outcome);
  return m;
}
/** Stato di un computer senza la prova: licenza, prova vecchia ancora in corso, oppure aperto senza comprare. */
const kindOf = (u: A.User, lastTrial: Map<string, string>) => u.key ? "license" : lastTrial.get(u.device) === "active" ? "legacy" : "notbought";

function notBought(users: A.User[], lastTrial: Map<string, string>, firstRun: FirstRunRow[], paid: Order[], now: number) {
  const fresh = users.filter((u) => !OWN_DEVICES.has(u.device) && now - u.firstSeen < 30 * DAY);
  const legacy = users.filter((u) => !u.key && !OWN_DEVICES.has(u.device) && lastTrial.get(u.device) === "active");
  const cohort = fresh.filter((u) => !u.key && lastTrial.get(u.device) !== "active");
  const ids = new Set(cohort.map((u) => u.device));
  const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const days = Array.from({ length: 30 }, (_, i) => ({ day: day(now - (29 - i) * DAY), macos: 0, windows: 0, unknown: 0 }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const u of cohort) { const d = byDay.get(day(u.firstSeen)); if (d) d[u.os === "macos" || u.os === "windows" ? u.os : "unknown"]++; }
  const reached = new Map<string, Set<string>>();
  for (const r of firstRun) if (ids.has(r.device)) (reached.get(r.step) ?? reached.set(r.step, new Set()).get(r.step)!).add(r.device);
  const count = (prefix: string) => [...reached.entries()].filter(([k]) => k.startsWith(prefix)).map(([step, s]) => ({ step, n: s.size })).sort((a, b) => b.n - a.n);
  const gone = cohort.filter((u) => now - u.lastSeen >= STILL).map((u) => u.lastSeen - u.firstSeen);
  const edges: [string, number][] = [["10m", 10 * 60_000], ["1h", H], ["1d", DAY], ["7d", 7 * DAY], ["more", Infinity]];
  return {
    total: cohort.length, os: osCount(cohort.map((u) => u.os)), days,
    base: reached.get("launch")?.size ?? 0, stepsSince: firstRun.length ? Math.min(...firstRun.map((r) => r.ts)) : null,
    steps: FUNNEL.map((step) => ({ step, n: reached.get(step)?.size ?? 0 })),
    why: count("why_"), quitWhy: count("quitwhy_"),
    stopped: { still: cohort.length - gone.length, buckets: edges.map(([k, ms], i) => ({ k, n: gone.filter((t) => t < ms && (i === 0 || t >= edges[i - 1][1])).length })) },
    conversion: { opened: fresh.length - fresh.filter((u) => !u.key && lastTrial.get(u.device) === "active").length,
      licensed: fresh.filter((u) => u.key).length, sales: paid.filter((o) => now - o.ts < 30 * DAY).length },
    legacy: { n: legacy.length, os: osCount(legacy.map((u) => u.os)) },
  };
}

export function dashData(raw: Raw, now: number) {
  const hits = raw.hits.filter((x) => !Wx.TEST_SOURCES.has(x.src));
  const site = Wx.summarize(hits, now), x = Wx.summarizeAccess(raw.access, now), access = raw.access, orders = raw.orders;
  const users = Wx.summarizeUsers(raw.ledger, access, now, raw.devices);
  const lastTrial = lastTrialOf(access), kinds = users.map((u) => kindOf(u, lastTrial));
  const rel = raw.gh ? Wx.githubReleases(raw.gh) : null;
  const week = (ts: number) => now - ts < 7 * DAY, sum = (a: number[]) => a.reduce((n, v) => n + v, 0);
  const paid = (orders ?? []).filter((o) => o.state === "pagato");
  const refused = access.filter((r) => r.outcome === "refused");
  const osOf = Wx.osByDevice(access);
  const vis = site.days.map((q) => q.visits), dl = site.days.map((q) => q.downloads);
  const sales = { paid: orders ? paid.length : x.sales.length, cents: sum(paid.map((o) => o.cents)), currency: paid[0]?.currency ?? "EUR",
    lastTs: paid.length ? Math.max(...paid.map((o) => o.ts)) : null,
    days: site.days.map((q) => paid.filter((o) => new Date(o.ts).toISOString().slice(0, 10) === q.day).length), readable: !!orders };

  // Eventi: visite e download per persona, accessi senza battito, ordini (tabEvents)
  const events: { ts: number; [k: string]: unknown }[] = [];
  for (const p of site.sessions) {
    const where = { from: name(p.from), country: p.country };
    if (p.clicks) events.push({ ts: p.views ? p.first : p.firstClick, type: p.views ? "visit+download" : "download", arches: p.arches, clicks: p.clicks,
      minutes: Math.max(1, Math.round((p.lastClick - p.firstClick) / 60000)), ...where });
    else if (p.views) events.push({ ts: p.first, type: "visit", views: p.views, ...where });
  }
  for (const r of access) {
    if ((r.kind === "validate" && r.outcome === "ok") || (r.kind === "trial" && r.outcome === "active")) continue;
    if (orders && (r.kind === "sale" || r.kind === "refund")) continue;
    events.push({ type: "access", ...accessOut(r) });
  }
  for (const o of orders ?? []) events.push({ type: "order", ...o });
  events.sort((a, b) => b.ts - a.ts);
  const newTrials = access.filter((r) => r.kind === "trial" && r.outcome === "new" && week(r.ts));

  const reasons = new Map<string, number>();
  for (const r of refused) { const k = `${r.kind}:${r.reason || "?"}`; reasons.set(k, (reasons.get(k) ?? 0) + 1); }
  const macs = (ms: number) => new Set(access.filter((r) => r.device && r.outcome !== "refused" && now - r.ts < ms).map((r) => r.device)).size;
  const latest = Wx.latestSocial(raw.social);
  const platforms = [...new Set(latest.map((r) => r.platform))].map((p) => {
    const mine = latest.filter((r) => r.platform === p);
    return { platform: p, views: sum(mine.map((r) => r.views)), videos: mine.length, lastRead: Math.max(...raw.social.filter((r) => r.platform === p).map((r) => r.ts)) };
  });

  return {
    overview: {
      sales, days: site.days, visits30: site.visits, clicks30: site.downloads, downloaders30: site.downloaders,
      visits7: sum(vis.slice(-7)), visits7prev: sum(vis.slice(-14, -7)), downloaders7: sum(dl.slice(-7)), downloaders7prev: sum(dl.slice(-14, -7)),
      trialing: x.trialing, trialingOs: osCount(x.trialingOs), expiredBack: x.expiredBack, trialsOs: osCount(x.trialsOs),
      liveLicenses: x.liveLicenses, refused24: x.recent.filter((r) => r.outcome === "refused" && now - r.ts < DAY).length, refused7d: x.refused7d,
      funnel: [site.visits, site.downloaders, x.trialing + x.expiredBack, sales.paid],
      feed: x.recent.slice(0, 12).map(accessOut), licenses: x.licenses.map((l) => ({ key: l.key, lastOk: l.lastOk, macs: l.macs, country: l.country,
        lastRefused: l.lastRefused ? { ts: l.lastRefused.ts, reason: l.lastRefused.reason } : null })),
      sources: site.bySource.map(([k, v, d]) => [name(k), v, d]), countries: site.countries, people: site.people.slice(0, 5).map(person),
      ghDmg: rel ? sum(rel.slice(0, 10).map((r) => r.dmgArm + r.dmgIntel)) : null,
    },
    events: { visits7: site.sessions.filter((p) => p.views && week(p.first)).length, people7: site.sessions.filter((p) => p.clicks && week(p.firstClick)).length,
      trials7: newTrials.length, trials7Os: osCount(newTrials.map((r) => osOf.get(r.device) ?? "")),
      sales7: paid.filter((o) => week(o.ts)).length, list: events.slice(0, 200) },
    users: { total: users.length, active7: users.filter((u) => now - u.lastSeen < 7 * DAY).length, os: osCount(users.map((u) => u.os)),
      trial: users.filter((u) => u.state === "trial").length, expired: users.filter((u) => u.state === "expired").length,
      license: users.filter((u) => u.state === "license").length,
      notBought: kinds.filter((k) => k === "notbought").length, legacy: kinds.filter((k) => k === "legacy").length,
      rows: users.map((u, i) => ({ ...u, kind: kinds[i] })) },
    activity: { today: macs(DAY), week: macs(7 * DAY), newTrials7: newTrials.length, events30: access.length, days: Wx.activeByDay(access, now),
      history: access.filter((r) => !(r.kind === "validate" && r.outcome === "ok")).slice(-100).reverse().map(accessOut) },
    downloads: { downloaders: site.downloaders, clicks: site.downloads, dmg: rel ? sum(rel.map((r) => r.dmgArm + r.dmgIntel)) : 0,
      win: rel ? sum(rel.map((r) => r.win)) : 0, updates: rel ? sum(rel.map((r) => r.updates)) : 0,
      latestTag: rel?.[0]?.tag ?? "", latestChecks: rel?.[0]?.checks ?? 0, people: site.people.map(person), releases: rel },
    sales: { ...sales, week: paid.filter((o) => week(o.ts)).length, gifted: (orders ?? []).filter((o) => o.state === "regalato").length, orders },
    security: { refused24: refused.filter((r) => now - r.ts < DAY).length, refused7: refused.filter((r) => week(r.ts)).length,
      fake: refused.filter((r) => r.reason === "bad_device").length, shared: refused.filter((r) => r.reason === "device_mismatch").length,
      reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [kind, reason] = k.split(":"); return { kind, reason, n }; }),
      list: refused.slice(-50).reverse().map(accessOut) },
    notBought: notBought(users, lastTrial, raw.firstRun ?? [], paid, now),
    social: { total: sum(latest.map((r) => r.views)), lastRead: raw.social.length ? Math.max(...raw.social.map((r) => r.ts)) : null, platforms, rows: latest },
  };
}

