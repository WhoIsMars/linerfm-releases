// Schede del pannello admin oltre alla Panoramica: Utenti, Attività, Download, Vendite, Sicurezza.
// Stesso accesso della dashboard (link segreto o password), stesso guscio grafico (shell).
import {
  C, DAY, esc, rome, ago, countryName, flag, money, icon, eventLine, reasonText, dayOf, type AccessRow,
} from "./dashboard";

const TRIAL_DAYS = 5;
const HASH = /^[0-9a-f]{64}$/;

// ── Dati ──────────────────────────────────────────────────────────────────────
export interface LedgerEntry { hash: string; started_at: number }

export interface User {
  device: string; state: "trial" | "expired" | "license"; key: string; daysLeft: number; activeDays: number;
  country: string; firstSeen: number; lastSeen: number; started: number;
}

/** Una riga per Mac: il registro delle prove (da sempre) unito al registro accessi (dal 17/10). */
export function summarizeUsers(ledger: LedgerEntry[], access: AccessRow[], now: number): User[] {
  const users = new Map<string, User & { days: Set<string>; lastTrial: string; real: boolean }>();
  const get = (device: string) => {
    let u = users.get(device);
    if (!u) {
      u = { device, state: "trial", key: "", daysLeft: 0, activeDays: 0, country: "", firstSeen: 0, lastSeen: 0, started: 0, days: new Set(), lastTrial: "", real: false };
      users.set(device, u);
    }
    return u;
  };
  for (const l of ledger) {
    if (!HASH.test(l.hash)) continue; // probe-diag, testdevice… non sono Mac
    const u = get(l.hash.slice(0, 8));
    u.started = l.started_at * 1000; u.real = true;
    u.firstSeen = u.firstSeen ? Math.min(u.firstSeen, u.started) : u.started;
    u.lastSeen = Math.max(u.lastSeen, u.started);
  }
  for (const r of access) {
    if (!r.device || r.outcome === "refused") continue; // un rifiuto non è un utente
    if (r.kind === "sale" || r.kind === "refund") continue;
    const u = get(r.device);
    u.real = true;
    u.firstSeen = u.firstSeen ? Math.min(u.firstSeen, r.ts) : r.ts;
    u.lastSeen = Math.max(u.lastSeen, r.ts);
    u.days.add(dayOf(r.ts));
    if (r.country) u.country = r.country;
    if ((r.kind === "validate" || r.kind === "activate") && r.outcome === "ok" && r.key) u.key = r.key;
    if (r.kind === "trial") u.lastTrial = r.outcome;
  }
  return [...users.values()].filter((u) => u.real).map((u) => {
    const ends = u.started + TRIAL_DAYS * DAY;
    const state: User["state"] = u.key ? "license"
      : u.started ? (now < ends ? "trial" : "expired")
      : u.lastTrial === "expired" ? "expired" : "trial";
    const { days, lastTrial, real, ...rest } = u;
    return { ...rest, state, daysLeft: state === "trial" && u.started ? Math.ceil((ends - now) / DAY) : 0, activeDays: days.size };
  }).sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Mac distinti al giorno (qualsiasi accesso riuscito) e nuove prove, ultimi 30 giorni. */
export function activeByDay(access: AccessRow[], now: number) {
  const days = Array.from({ length: 30 }, (_, i) => ({ day: dayOf(now - (29 - i) * DAY), active: 0, newTrials: 0 }));
  const by = new Map(days.map((d) => [d.day, { d, macs: new Set<string>() }]));
  for (const r of access) {
    const slot = by.get(dayOf(r.ts));
    if (!slot || r.outcome === "refused" || !r.device) continue;
    slot.macs.add(r.device);
    if (r.kind === "trial" && r.outcome === "new") slot.d.newTrials++;
  }
  for (const { d, macs } of by.values()) d.active = macs.size;
  return days;
}

export interface GhRelease { tag_name: string; published_at: string; assets: { name: string; download_count: number }[] }
/** Per release: installazioni nuove (DMG), aggiornamenti scaricati (.app.tar.gz), controlli dell'updater (latest.json). */
export function githubReleases(list: GhRelease[]) {
  const n = (r: GhRelease, re: RegExp) => r.assets.filter((a) => re.test(a.name)).reduce((s, a) => s + a.download_count, 0);
  return list.map((r) => ({
    tag: r.tag_name, date: (r.published_at ?? "").slice(0, 10),
    dmgArm: n(r, /aarch64\.dmg$/), dmgIntel: n(r, /x64\.dmg$/), updates: n(r, /\.app\.tar\.gz$/), checks: n(r, /^latest\.json$/),
  }));
}

/** Copia in D1 (tabella cache) di una risposta esterna: GitHub limita le chiamate che arrivano da Cloudflare. */
export async function cachedJson<T>(db: D1Database, key: string, now: number, maxAgeMs: number, load: () => Promise<T>): Promise<T | null> {
  let row: { ts: number; value: string } | null = null;
  try { row = await db.prepare("SELECT ts, value FROM cache WHERE k = ?").bind(key).first<{ ts: number; value: string }>(); } catch { /* tabella assente */ }
  if (row && now - row.ts < maxAgeMs) return JSON.parse(row.value) as T;
  try {
    const fresh = await load();
    try { await db.prepare("INSERT OR REPLACE INTO cache (k, ts, value) VALUES (?, ?, ?)").bind(key, now, JSON.stringify(fresh)).run(); } catch { /* la copia è facoltativa */ }
    return fresh;
  } catch {
    return row ? (JSON.parse(row.value) as T) : null;
  }
}

export async function loadGithub(fetchImpl: typeof fetch): Promise<GhRelease[]> {
  const r = await fetchImpl("https://api.github.com/repos/WhoIsMars/linerfm-releases/releases?per_page=15", { headers: { "User-Agent": "linerfm-site-stats", Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return (await r.json()) as GhRelease[];
}

export async function readLedger(kv: KVNamespace | undefined): Promise<LedgerEntry[]> {
  if (!kv) return [];
  try {
    const { keys } = await kv.list({ limit: 1000 });
    const real = keys.map((k) => k.name).filter((k) => HASH.test(k)).slice(0, 500);
    const values = await Promise.all(real.map((k) => kv.get(k)));
    return real.map((hash, i) => { try { return { hash, started_at: Number(JSON.parse(values[i] ?? "{}").started_at) || 0 }; } catch { return { hash, started_at: 0 }; } });
  } catch { return []; }
}

export const maskEmail = (e: string) => { const [u, d] = String(e).split("@"); return d ? `${u.slice(0, 1)}••••@${d}` : "••••"; };

export interface Order { ts: number; number: number; cents: number; discount: number; currency: string; email: string; state: "pagato" | "rimborsato" | "regalato" }
export async function readOrders(fetchImpl: typeof fetch, apiKey: string | undefined, storeId: string): Promise<Order[] | null> {
  if (!apiKey) return null;
  try {
    const out: Order[] = [];
    for (let n = 1, last = 1; n <= last && n <= 10; n++) {
      const r = await fetchImpl(`https://api.lemonsqueezy.com/v1/orders?filter[store_id]=${storeId}&page[number]=${n}&page[size]=100`,
        { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" } });
      if (!r.ok) return null;
      const body = (await r.json()) as { data?: { attributes: Record<string, any> }[]; meta?: { page?: { lastPage?: number } } };
      last = body.meta?.page?.lastPage ?? 1;
      for (const { attributes: a } of body.data ?? []) {
        if (a.test_mode) continue;
        out.push({ ts: Date.parse(a.created_at), number: a.order_number, cents: a.total, discount: a.discount_total ?? 0, currency: a.currency,
          email: maskEmail(a.user_email ?? ""), state: a.refunded ? "rimborsato" : a.total > 0 ? "pagato" : "regalato" });
      }
    }
    return out.sort((a, b) => b.ts - a.ts);
  } catch { return null; }
}

// ── Pezzi grafici ─────────────────────────────────────────────────────────────
export const TABS: [string, string][] = [["panoramica", "Panoramica"], ["utenti", "Utenti"], ["attivita", "Attività"], ["download", "Download"], ["vendite", "Vendite"], ["sicurezza", "Sicurezza"]];
export const navHtml = (active: string) =>
  `<nav class="nav" aria-label="Sezioni">${TABS.map(([k, label]) => `<a href="/dashboard${k === "panoramica" ? "" : `?tab=${k}`}"${k === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;

function kpi(color: string, ic: string, label: string, value: string | number, foot = ""): string {
  return `<article class="tile" style="--c:${color};min-height:118px"><header><span class="ico">${icon(ic)}</span>${esc(label)}</header><b class="num" data-n="${typeof value === "number" ? value : ""}">${esc(value)}</b>${foot ? `<footer>${esc(foot)}</footer>` : ""}</article>`;
}
const card = (span: string, title: string, sub: string, inner: string) => `<section class="card ${span}"><h2>${esc(title)}${sub ? ` <small>${esc(sub)}</small>` : ""}</h2>${inner}</section>`;
const empty = (text: string) => `<p class="muted">${esc(text)}</p>`;

function bars30(values: number[], days: string[], color: string, marks: number[] = [], unit = ""): string {
  const max = Math.max(1, ...values);
  return `<div class="chart">${values.map((v, i) => `<div class="col"><div class="stack" style="height:${Math.round((v / max) * 100)}%"><i class="v" style="background:${color}"></i>${marks[i] ? `<i class="d" style="height:${Math.round((marks[i] / Math.max(1, v)) * 100)}%;background:${C.orange}"></i>` : ""}</div><em>${esc(days[i].slice(8))}/${esc(days[i].slice(5, 7))}<br>${v} ${esc(unit)}${marks[i] ? `, ${marks[i]} nuove prove` : ""}</em>${i % 7 === 2 || i === values.length - 1 ? `<span>${esc(days[i].slice(8))}/${esc(days[i].slice(5, 7))}</span>` : ""}</div>`).join("")}</div>`;
}

// funzione e non costante: i colori arrivano da dashboard.ts, che importa questo file (import circolare)
const stateOf = (st: User["state"]): [string, string] => ({ trial: ["In prova", C.orange], expired: ["Prova finita", C.gray], license: ["Licenza", C.green] } as Record<User["state"], [string, string]>)[st];

// ── Schede ────────────────────────────────────────────────────────────────────
export function tabUsers(users: User[], now: number): string {
  const n = (st: User["state"]) => users.filter((u) => u.state === st).length;
  const active7 = users.filter((u) => now - u.lastSeen < 7 * DAY).length;
  const rows = users.map((u) => {
    const [label, color] = stateOf(u.state);
    const trial = u.state === "license" ? "" : u.state === "trial" ? (u.daysLeft ? `${u.daysLeft} ${u.daysLeft === 1 ? "giorno" : "giorni"} rimasti` : "in corso") : u.started ? `finita il ${rome(u.started + TRIAL_DAYS * DAY).slice(0, 5)}` : "finita";
    return `<tr><td class="mono">${esc(u.device)}</td><td><span class="state" style="--c:${color}">${label}</span></td><td>${u.key ? `<span class="mono">····${esc(u.key)}</span>` : `<span class="muted">${esc(trial)}</span>`}</td><td>${esc(u.activeDays || "")}</td><td>${esc(rome(u.firstSeen))}</td><td>${esc(ago(u.lastSeen, now))}</td><td>${u.country ? `${flag(u.country)} ${esc(countryName(u.country))}` : '<span class="muted">non noto</span>'}</td></tr>`;
  }).join("");
  return `<section class="kpis" style="margin-top:16px">${kpi(C.blue, "mac", "Mac in tutto", users.length, `${active7} attivi negli ultimi 7 giorni`)}${kpi(C.orange, "mac", "In prova", n("trial"))}${kpi(C.gray, "mac", "Prova finita, senza licenza", n("expired"))}${kpi(C.green, "key", "Con licenza", n("license"))}</section>
<div class="grid">${card("s12", "Tutti i Mac", "dal più recente", users.length ? `<div class="scroll"><table class="table"><thead><tr><th>Mac</th><th>Stato</th><th>Licenza o prova</th><th>Giorni attivi</th><th>Primo accesso</th><th>Ultimo accesso</th><th>Paese</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty("Ancora nessun Mac ha aperto l'app."))}</div>
<p class="foot">Un Mac è il suo identificativo anonimo (8 caratteri). Le prove partono dal registro delle prove gratuite; giorni attivi, paese e licenza dal registro accessi, attivo dal 17/10. "Giorni attivi" vuoto vuol dire che il Mac non ha più aperto l'app da quando c'è il registro.</p>`;
}

export function tabActivity(access: AccessRow[], now: number): string {
  const days = activeByDay(access, now);
  const macs = (ms: number) => new Set(access.filter((r) => r.device && r.outcome !== "refused" && now - r.ts < ms).map((r) => r.device)).size;
  const newTrials7 = access.filter((r) => r.kind === "trial" && r.outcome === "new" && now - r.ts < 7 * DAY).length;
  const events = access.filter((r) => !(r.kind === "validate" && r.outcome === "ok")).slice(-100).reverse();
  const feed = events.length ? `<ul class="feed">${events.map((r) => { const e = eventLine(r); const col = e.tone === "ok" ? C.green : e.tone === "bad" ? C.red : e.tone === "warn" ? C.orange : C.blue;
    return `<li style="--c:${col}"><i class="badge"></i><div><b>${esc(e.title)}</b><span>${esc(e.detail)}${r.country ? ` · ${flag(r.country)} ${esc(countryName(r.country))}` : ""}</span></div><time title="${esc(ago(r.ts, now))}">${esc(rome(r.ts))}</time></li>`; }).join("")}</ul>` : empty("Nessun evento registrato finora.");
  return `<section class="kpis" style="margin-top:16px">${kpi(C.teal, "mac", "Mac attivi oggi", macs(DAY))}${kpi(C.blue, "mac", "Mac attivi, 7 giorni", macs(7 * DAY))}${kpi(C.orange, "mac", "Nuove prove, 7 giorni", newTrials7)}${kpi(C.indigo, "shield", "Eventi, 30 giorni", access.length)}</section>
<div class="grid">${card("s12", "Mac attivi al giorno", "in arancione le nuove prove", bars30(days.map((d) => d.active), days.map((d) => d.day), C.teal, days.map((d) => d.newTrials), "Mac attivi"))}
${card("s12", "Cronologia", "ultimi 100 eventi, senza i controlli orari riusciti", feed)}</div>
<p class="foot">Un Mac con licenza contatta il server ogni ora, uno in prova a ogni avvio dell'app: "attivo" vuol dire che l'app era aperta quel giorno.</p>`;
}

export function tabDownloads(site: { downloads: number; recent: { ts: number; arch: string; from: string; country: string }[] }, rel: ReturnType<typeof githubReleases> | null, now: number, prettySource: (s: string) => string): string {
  const dmg = rel ? rel.reduce((s, r) => s + r.dmgArm + r.dmgIntel, 0) : 0;
  const upd = rel ? rel.reduce((s, r) => s + r.updates, 0) : 0;
  const latest = rel?.[0];
  const archName = (a: string) => (a === "apple-silicon" ? "Apple Silicon" : a === "intel" ? "Intel" : a === "github-page" ? "pagina GitHub" : a);
  const siteList = site.recent.length ? `<ul class="feed">${site.recent.map((r) => `<li style="--c:${C.indigo}"><i class="badge"></i><div><b>${esc(archName(r.arch))}</b><span>da ${esc(prettySource(r.from))} · ${flag(r.country)} ${esc(countryName(r.country))}</span></div><time>${esc(rome(r.ts))}</time></li>`).join("")}</ul>` : empty("Nessun download dal sito negli ultimi 30 giorni.");
  const table = rel ? `<div class="scroll"><table class="table"><thead><tr><th>Release</th><th>Uscita</th><th>DMG Apple Silicon</th><th>DMG Intel</th><th>Aggiornamenti scaricati</th><th>Controlli updater</th></tr></thead><tbody>${rel.map((r) => `<tr><td><b>${esc(r.tag)}</b></td><td>${esc(r.date.split("-").reverse().join("/"))}</td><td>${esc(r.dmgArm)}</td><td>${esc(r.dmgIntel)}</td><td>${esc(r.updates)}</td><td>${esc(r.checks)}</td></tr>`).join("")}</tbody></table></div>` : empty("GitHub non raggiungibile e nessuna copia salvata.");
  return `<section class="kpis" style="margin-top:16px">${kpi(C.indigo, "down", "Download dal sito, 30 giorni", site.downloads)}${kpi(C.blue, "down", "DMG scaricati da GitHub", dmg, "installazioni nuove, tutte le release")}${kpi(C.teal, "down", "Aggiornamenti scaricati", upd, "app già installate che si sono aggiornate")}${kpi(C.orange, "mac", `Controlli updater ${latest ? latest.tag : ""}`, latest ? latest.checks : 0, "volte che un'app ha cercato aggiornamenti")}</section>
<div class="grid">${card("s5", "Ultimi download dal sito", "", siteList)}${card("s7", "Per release", "da GitHub", table)}</div>
<p class="foot">I numeri di GitHub sono totali dall'uscita di ogni release e si aggiornano ogni 30 minuti. Il download dal sito conta il click sul pulsante; GitHub conta i file scaricati davvero, anche da chi non passa dal sito.</p>`;
}

export function tabSales(orders: Order[] | null, now: number): string {
  if (!orders) return `<div class="grid">${card("s12", "Vendite", "", empty("Lemon Squeezy non leggibile in questo momento."))}</div>`;
  const paid = orders.filter((o) => o.state === "pagato");
  const cur = paid[0]?.currency ?? "EUR";
  const total = paid.reduce((s, o) => s + o.cents, 0);
  const week = paid.filter((o) => now - o.ts < 7 * DAY).length;
  const COLOR = { pagato: C.green, rimborsato: C.red, regalato: C.gray } as const;
  const rows = orders.map((o) => `<tr><td>${esc(rome(o.ts))}</td><td>#${esc(o.number)}</td><td><span class="state" style="--c:${COLOR[o.state]}">${o.state}</span></td><td><b>${esc(money(o.cents, o.currency))}</b></td><td>${o.discount ? esc(money(o.discount, o.currency)) : '<span class="muted">nessuno</span>'}</td><td class="mono">${esc(o.email)}</td></tr>`).join("");
  return `<section class="kpis" style="margin-top:16px">${kpi(C.green, "money", "Vendite", paid.length, paid[0] ? `ultima ${ago(paid[0].ts, now)}` : "")}${kpi(C.green, "money", "Incassato", money(total, cur), "IVA compresa")}${kpi(C.blue, "money", "Vendite, 7 giorni", week)}${kpi(C.gray, "key", "Licenze regalate", orders.filter((o) => o.state === "regalato").length, "ordini a 0 €, sconto 100%")}</section>
<div class="grid">${card("s12", "Ordini", "da Lemon Squeezy, ordini di prova esclusi", orders.length ? `<div class="scroll"><table class="table"><thead><tr><th>Quando</th><th>Ordine</th><th>Stato</th><th>Totale</th><th>Sconto</th><th>Cliente</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty("Ancora nessun ordine."))}</div>
<p class="foot">L'email del cliente è mascherata anche qui; quella completa è su Lemon Squeezy, Orders.</p>`;
}

export function tabSecurity(access: AccessRow[], now: number): string {
  const refused = access.filter((r) => r.outcome === "refused");
  const n = (ms: number) => refused.filter((r) => now - r.ts < ms).length;
  const by = new Map<string, number>();
  for (const r of refused) { const k = `${r.kind}:${r.reason || "?"}`; by.set(k, (by.get(k) ?? 0) + 1); }
  const KIND: Record<string, string> = { trial: "Prova", activate: "Attivazione", validate: "Controllo licenza", reset: "Reset", deactivate: "Disattivazione" };
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...top.map(([, v]) => v));
  const reasons = top.length ? `<ul class="hbars">${top.map(([k, v]) => { const [kind, reason] = k.split(":"); return `<li style="--c:${C.red}"><span>${esc(KIND[kind] ?? kind)}: ${esc(reasonText(reason))}</span><b>${esc(v)}</b><div class="track"><i style="width:${Math.max(3, Math.round((v / max) * 100))}%"></i></div></li>`; }).join("")}</ul>` : empty("Nessun rifiuto negli ultimi 30 giorni.");
  const list = refused.length ? `<ul class="feed">${refused.slice(-50).reverse().map((r) => { const e = eventLine(r); return `<li style="--c:${C.red}"><i class="badge"></i><div><b>${esc(e.title)}</b><span>${esc(e.detail)}${r.country ? ` · ${flag(r.country)} ${esc(countryName(r.country))}` : ""}</span></div><time>${esc(rome(r.ts))}</time>${r.id ? `<form method="post" action="/dashboard?tab=sicurezza" class="dismiss"><button name="dismiss" value="${esc(r.id)}" title="Togli: era una prova">Togli</button></form>` : ""}</li>`; }).join("")}</ul>` : empty("Nessun tentativo rifiutato.");
  const fake = refused.filter((r) => r.reason === "bad_device").length;
  const shared = refused.filter((r) => r.reason === "device_mismatch").length;
  return `<section class="kpis" style="margin-top:16px">${kpi(n(DAY) ? C.red : C.green, n(DAY) ? "alert" : "shield", "Rifiuti, 24 ore", n(DAY))}${kpi(n(7 * DAY) ? C.red : C.green, "shield", "Rifiuti, 7 giorni", n(7 * DAY))}${kpi(fake ? C.orange : C.green, "mac", "Prove finte bloccate", fake, "identificativo del Mac non valido")}${kpi(shared ? C.orange : C.green, "key", "Chiavi copiate su un altro Mac", shared, "bloccate dal controllo del Mac")}</section>
<div class="grid">${card("s5", "Motivi", "ultimi 30 giorni", reasons)}${card("s7", "Tentativi rifiutati", "più recenti in alto", list)}</div>
<p class="foot">Dal 17/10 il server lega ogni risposta al Mac che la chiede, rifiuta identificativi non validi e chiavi usate su un Mac diverso da quello attivato. Le protezioni dentro l'app (orologio, server finto, identità del Mac) arrivano con la prossima release.</p>`;
}
