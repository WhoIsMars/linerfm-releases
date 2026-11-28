// Dashboard online (dal 28/11/2026): la pagina di casa dell'owner (~/LinerFM-Social/review/index.html, copiata in
// src/dash/page.ts da scripts/copy-dash-page.mjs) servita a /dashboard, dietro lo stesso cancello della vecchia.
//   /dashboard            la pagina (le vecchie schede restano a /dashboard?tab=...)
//   /dashboard/api/*      le stesse risposte di review/server.py: dati del Mac da dash_snapshot, numeri calcolati qui
//   /dashboard/f/<file>   video e copertine da R2 (binding MEDIA), mai pubblici, a pezzi per Safari
//   /dashboard/sync/*     solo per review/push.py, con DASH_SYNC_SECRET: spinta dei dati, righe nuove, video
// Le scritture dal telefono (voti, decisioni, scelte) vanno in dash_actions già nel formato di feedback.jsonl;
// push.py le copia in feedback.jsonl. Spostare date e mandare su Discord restano sulla pagina del Mac.
import { dashAccess, passwordRequired, DAY, type Env as DashEnv, type AccessRow, type Row } from "./dashboard";
import { cachedJson, loadGithub, readDevices, readLedger, readOrders, type GhRelease, type SocialRow } from "./admin";
import { dashData } from "./dash-data";
import { PAGE } from "./dash/page";

export interface Env extends DashEnv { DASH_SYNC_SECRET?: string; MEDIA?: R2Bucket; DASH_MEDIA_CAP?: string; DASH_TEST_WRITES?: string }

type J = Record<string, unknown>;
const OPEN = ["pronto", "da creare", "bloccato", "da rifare"];
const PIECES = ["ids", "items", "unlinked", "published", "decisions", "feedback", "local", "discord"] as const;
const MEDIA_CAP = 2_000_000_000;                    // tetto di R2 (piano gratis 10 GB): push.py si ferma prima
const MEDIA_MAX_FILE = 95_000_000;                   // il corpo di una richiesta al worker arriva a 100 MB
const MEDIA_KEY = /^(queue|montaggio)\/(?:[^/]+\/)*[^/]+\.(mp4|jpg|jpeg|png)$/;
const TYPES: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
const err = (msg: string, status = 400) => json({ error: msg }, status);

/** fid e ts di una riga di feedback.jsonl, come App._append di server.py: ora di Roma con l'offset. */
export function romeStamp(ms: number, hex: string): { fid: string; ts: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZoneName: "longOffset",
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const off = p.timeZoneName === "GMT" ? "+00:00" : p.timeZoneName.slice(3);
  return { fid: `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}-${hex}`, ts: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}` };
}
const romeNow = (ms: number) => { const t = romeStamp(ms, "").ts; return `${t.slice(0, 10)} ${t.slice(11, 16)}`; };
const hex4 = () => [...crypto.getRandomValues(new Uint8Array(2))].map((b) => b.toString(16).padStart(2, "0")).join("");

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const syncAllowed = (req: Request, env: Env) =>
  !!env.DASH_SYNC_SECRET && env.DASH_SYNC_SECRET.length >= 32 && sameText(req.headers.get("Authorization") ?? "", "Bearer " + env.DASH_SYNC_SECRET);

// ── dati del Mac ─────────────────────────────────────────────────────────────
async function piece<T>(env: Env, name: string, fallback: T): Promise<T> {
  try {
    const r = await env.DB.prepare("SELECT json FROM dash_snapshot WHERE name = ?").bind(name).first<{ json: string }>();
    return r ? (JSON.parse(r.json) as T) : fallback;
  } catch { return fallback; }
}
async function pendingRows(env: Env): Promise<J[]> {
  try {
    const { results } = await env.DB.prepare("SELECT row FROM dash_actions ORDER BY ts").all<{ row: string }>();
    return (results ?? []).map((r) => JSON.parse(r.row) as J);
  } catch { return []; }
}
/** Le righe di feedback.jsonl spinte dal Mac più quelle fatte online e non ancora arrivate là (per fid). */
async function feedbackRows(env: Env): Promise<J[]> {
  const rows = await piece<J[]>(env, "feedback", []);
  const seen = new Set(rows.map((r) => r.fid).filter(Boolean));
  return [...rows, ...(await pendingRows(env)).filter((r) => !seen.has(r.fid))];
}
// come App.feedback_list e App.decisions di server.py
function feedbackList(rows: J[]): J[] {
  const acks = new Map<unknown, J[]>();
  for (const r of rows) if (r.kind === "ack") acks.set(r.ref, [...(acks.get(r.ref) ?? []), r]);
  return rows.filter((r) => r.kind !== "ack").map((r) => ({ ...r, acks: acks.get(r.fid) ?? [] })).reverse();
}
// sull'anteprima (DASH_TEST_WRITES) le righe di prova contano, o una scelta fatta lì sembrerebbe persa
function decisionsOf(list: J[], rows: J[], withTest = false): J[] {
  const last = new Map<unknown, J>();
  for (const r of rows) if (r.kind === "decision" && (withTest || !r.test)) last.set(r.decision, { fid: r.fid, ts: r.ts, choice: r.choice, note: r.note });
  return list.map((d) => ({ ...d, decided: last.get(d.id) ?? null }));
}
function itemsOf(all: J[], statuses: string[], now: number): J[] {
  const stamp = romeNow(now);
  return all.filter((i) => statuses.includes(String(i.status)))
    .map((i): J => ({ ...i, overdue: i.status === "pronto" && !!i.date && `${i.date} ${i.time || "00:00"}` < stamp }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || String(a.date || "9999").localeCompare(String(b.date || "9999")) || String(a.time || "").localeCompare(String(b.time || "")));
}
/** File che si possono votare: quelli che la pagina mostra (video delle voci, varianti, montaggi nuovi). */
function knownFiles(items: J[], unlinked: J[]): Set<string> {
  const s = new Set<string>();
  for (const i of items) { if (i.video) s.add(String(i.video)); for (const v of (i.variants as string[]) ?? []) s.add(v); }
  for (const g of unlinked) for (const v of (g.variants as string[]) ?? []) s.add(v);
  return s;
}

// ── numeri: le schede della vecchia dashboard, calcolate qui (al massimo ogni 5 minuti) ──
async function numbers(env: Env, now: number, force: boolean, fetchImpl: typeof fetch) {
  const since = now - 30 * DAY;
  const load = async () => {
    const all = <T>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<T>().then((r) => r.results ?? []);
    const [hits, access, devices, social, ledger, orders, gh] = await Promise.all([
      all<Row>("SELECT ts, kind, ref, src, arch, sid, country FROM hits WHERE ts > ? ORDER BY ts", since),
      all<AccessRow>("SELECT rowid AS id, ts, kind, outcome, reason, device, key, country, os FROM access WHERE ts > ? AND rowid NOT IN (SELECT id FROM dismissed) ORDER BY ts", since),
      readDevices(env.DB),
      all<SocialRow>("SELECT ts, platform, item, title, views, likes, comments FROM social WHERE ts > ? ORDER BY ts", now - 60 * DAY).catch(() => [] as SocialRow[]),
      readLedger(env.TRIAL_LEDGER),
      readOrders(fetchImpl, env.LS_API_KEY, env.LS_STORE_ID ?? "406309"),
      cachedJson<GhRelease[]>(env.DB, "github-releases", now, 30 * 60_000, () => loadGithub(fetchImpl)),
    ]);
    return { readAt: new Date(now).toISOString(), dash: dashData({ hits, access: access.map((r) => ({ ...r, os: r.os ?? "" })), devices, social, ledger, orders, gh }, now) };
  };
  let data: J | null = null, error: string | null = null;
  try { data = await cachedJson<J>(env.DB, "dash-numbers", now, force ? 0 : 5 * 60_000, load); } catch (e) { error = String(e); }
  if (!data) error ??= "numbers not read";
  const discord = await piece<unknown>(env, "discord", { err: "not pushed from the Mac yet" });
  const at = data ? romeStamp(Date.parse(String(data.readAt)), "").ts : null;
  return { data: data && { ...data, discord }, at, err: error, loading: false };
}

// ── video su R2 ──────────────────────────────────────────────────────────────
async function serveMedia(req: Request, env: Env, key: string): Promise<Response> {
  if (!env.MEDIA || !MEDIA_KEY.test(key) || key.split("/").includes("..")) return err("not found", 404);
  const head = await env.MEDIA.head(key);
  if (!head) return err("not found", 404);
  const size = head.size, type = TYPES[key.split(".").pop()!.toLowerCase()];
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", ETag: head.httpEtag };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range") ?? "");
  if (!m || (m[1] === "" && m[2] === "")) {
    const obj = await env.MEDIA.get(key);
    return new Response(obj!.body, { headers: { ...base, "Content-Length": String(size) } });
  }
  let start: number, end: number;
  if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
  return new Response(obj!.body, { status: 206, headers: { ...base, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` } });
}
async function mediaList(env: Env): Promise<{ key: string; size: number }[]> {
  if (!env.MEDIA) return [];
  const out: { key: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const r = await env.MEDIA.list({ cursor, limit: 1000 });
    out.push(...r.objects.map((o) => ({ key: o.key, size: o.size })));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}

// ── instradamento ────────────────────────────────────────────────────────────
/** null = non è una rotta della pagina nuova (ci pensa handleDashboard, le vecchie schede). */
export async function handleDashOnline(req: Request, env: Env, now: number, fetchImpl: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(req.url), path = url.pathname;
  if (path === "/dashboard" && !(req.method === "GET" && !url.searchParams.has("tab") && !url.searchParams.has("k"))) return null;
  if (path !== "/dashboard" && !path.startsWith("/dashboard/")) return null;

  if (path.startsWith("/dashboard/sync/")) {
    if (!syncAllowed(req, env)) return err("sync secret required", 401);
    return sync(req, env, path.slice("/dashboard/sync/".length));
  }
  if (!(await dashAccess(req, env))) return passwordRequired();

  if (path === "/dashboard") {
    return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } });
  }
  if (path.startsWith("/dashboard/f/")) return serveMedia(req, env, decodeURIComponent(path.slice("/dashboard/f/".length)));
  if (!path.startsWith("/dashboard/api/")) return err("not found", 404);
  const api = path.slice("/dashboard/api/".length);

  if (req.method === "POST") {
    // Basic auth e cookie viaggiano anche da altri siti: valgono solo le fetch JSON della pagina stessa
    if (!(req.headers.get("Content-Type") ?? "").startsWith("application/json")) return err("Content-Type: application/json required", 415);
    const same = req.headers.get("Sec-Fetch-Site") === "same-origin" || req.headers.get("Origin") === url.origin;
    if (!same) return err("forbidden", 403);
    if (api === "schedule" || api === "discord") return err("Changing dates and sending to Discord work only on the Mac page for now.", 409);
    let b: J;
    try { b = (await req.json()) as J; } catch { return err("bad JSON"); }
    return write(env, api, b ?? {}, now);
  }
  if (req.method !== "GET") return err("not found", 404);
  switch (api) {
    case "items": {
      const st = url.searchParams.get("status")?.split(",") ?? OPEN;
      return json(itemsOf(await piece<J[]>(env, "items", []), st, now));
    }
    case "unlinked": return json(await piece(env, "unlinked", []));
    case "published": return json(await piece(env, "published", []));
    case "montaggio": case "variants": return json([]);      // Compare resta sulla pagina del Mac: online c'è solo l'ultima versione
    case "feedback": return json(feedbackList(await feedbackRows(env)));
    case "decisions": return json(decisionsOf(await piece<J[]>(env, "decisions", []), await feedbackRows(env), env.DASH_TEST_WRITES === "1"));
    case "overview": {
      const rows = await feedbackRows(env), list = feedbackList(rows), withTest = env.DASH_TEST_WRITES === "1";
      const local = {
        ...(await piece<J>(env, "local", {})),
        overdue: itemsOf(await piece<J[]>(env, "items", []), OPEN, now).filter((i) => i.overdue).length,
        unread: list.filter((r) => r.kind === "review" && !(r.acks as J[]).length && (withTest || !r.test)).length,
        decisions_open: decisionsOf(await piece<J[]>(env, "decisions", []), rows, withTest).filter((d) => !d.decided).length,
        synced: await env.DB.prepare("SELECT MAX(ts) AS ts FROM dash_snapshot").first<{ ts: number | null }>().then((r) => r?.ts ?? null).catch(() => null),
      };
      if (url.searchParams.has("lite")) return json({ local });
      return json({ local, numbers: await numbers(env, now, url.searchParams.has("refresh"), fetchImpl) });
    }
    default: return err("not found", 404);
  }
}

// come App.feedback / decide / pick di server.py, validati sui dati spinti dal Mac
async function write(env: Env, api: string, b: J, now: number): Promise<Response> {
  let row: J;
  const test = env.DASH_TEST_WRITES === "1" || !!b.test;
  if (api === "feedback") {
    const items = await piece<J[]>(env, "items", []), ids = new Set(await piece<string[]>(env, "ids", []));
    const item = (b.item as string) || null, file = (b.file as string) || null;
    if (item !== null && !ids.has(item)) return err(`unknown item: ${item}`);
    if (file !== null && !knownFiles(items, await piece<J[]>(env, "unlinked", [])).has(file)) return err(`file not on the page: ${file}`);
    if (item === null && file === null) return err("an item or a file is required");
    const vote = b.vote ?? null;
    if (vote !== null && ![1, 2, 3, 4, 5].includes(vote as number)) return err("vote from 1 to 5");
    const txt = Object.fromEntries(["good", "bad", "todo"].map((k) => [k, String(b[k] ?? "").trim()]));
    if (vote === null && !Object.values(txt).some(Boolean)) return err("a vote or a text is required");
    row = { kind: "review", item, file, vote, scale: "1-5", ...txt, test };
  } else if (api === "decision") {
    const d = (await piece<J[]>(env, "decisions", [])).find((x) => x.id === b.id);
    if (!d) return err(`unknown decision: ${String(b.id)}`);
    if (!((d.options as unknown[]) ?? []).includes(b.choice)) return err("choice not among the options");
    row = { kind: "decision", decision: d.id, choice: b.choice, note: String(b.note ?? "").trim(), test };
  } else if (api === "pick") {
    const dir = String(b.dir ?? ""), items = await piece<J[]>(env, "items", []);
    const owner = items.find((i) => i.montaggio && (dir === String(i.montaggio).replace(/\/$/, "") || dir.startsWith(String(i.montaggio).replace(/\/$/, "") + "/")));
    const v = new Set<string>([...((owner?.variants as string[]) ?? []), ...(((await piece<J[]>(env, "unlinked", [])).find((g) => g.dir === dir)?.variants as string[]) ?? [])]);
    const winner = b.winner as string, out = (b.eliminated as string[]) ?? [];
    if (!v.size || !v.has(winner) || !out.length || out.includes(winner) || !out.every((x) => v.has(x))) return err("winner and eliminated must be different edits of the folder");
    row = { kind: "pick", dir, item: owner?.id ?? null, winner, eliminated: out, test };
  } else return err("not found", 404);
  const full = { ...romeStamp(now, hex4()), ...row };
  await env.DB.prepare("INSERT INTO dash_actions (fid, ts, row) VALUES (?, ?, ?)").bind(full.fid, now, JSON.stringify(full)).run();
  return json(full);
}

async function sync(req: Request, env: Env, what: string): Promise<Response> {
  if (what === "snapshot" && req.method === "PUT") {
    let b: J;
    try { b = (await req.json()) as J; } catch { return err("bad JSON"); }
    const names = Object.keys(b ?? {});
    if (!names.length || names.some((n) => !(PIECES as readonly string[]).includes(n))) return err(`pieces: ${PIECES.join(", ")}`);
    const ts = Date.now();
    await env.DB.batch(names.map((n) => env.DB.prepare("INSERT OR REPLACE INTO dash_snapshot (name, ts, json) VALUES (?, ?, ?)").bind(n, ts, JSON.stringify(b[n]))));
    return json({ ok: true, pieces: names });
  }
  if (what === "actions" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT fid, row FROM dash_actions WHERE synced = 0 ORDER BY ts").all<{ fid: string; row: string }>();
    return json((results ?? []).map((r) => ({ fid: r.fid, row: JSON.parse(r.row) })));
  }
  if (what === "ack" && req.method === "POST") {
    const fids = (((await req.json().catch(() => ({}))) as J).fids as unknown[]) ?? [];
    const ok = fids.filter((f): f is string => typeof f === "string");
    if (ok.length) await env.DB.batch(ok.map((f) => env.DB.prepare("UPDATE dash_actions SET synced = 1 WHERE fid = ?").bind(f)));
    return json({ ok: true, acked: ok.length });
  }
  if (what === "media" && req.method === "GET") return json(await mediaList(env));
  if (what.startsWith("media/")) {
    const key = decodeURIComponent(what.slice("media/".length));
    if (!MEDIA_KEY.test(key) || key.split("/").includes("..")) return err("key must be a video or image under queue/ or montaggio/");
    if (!env.MEDIA) return err("R2 not bound", 503);
    if (req.method === "DELETE") { await env.MEDIA.delete(key); return json({ ok: true }); }
    if (req.method !== "PUT") return err("not found", 404);
    const body = await req.arrayBuffer();
    if (body.byteLength > MEDIA_MAX_FILE) return err("file too large", 413);
    const cap = Number(env.DASH_MEDIA_CAP) || MEDIA_CAP;
    const used = (await mediaList(env)).filter((o) => o.key !== key).reduce((n, o) => n + o.size, 0);
    if (used + body.byteLength > cap) return err(`R2 would go over ${cap} bytes`, 507);
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: TYPES[key.split(".").pop()!.toLowerCase()] } });
    return json({ ok: true, key, size: body.byteLength });
  }
  return err("not found", 404);
}
