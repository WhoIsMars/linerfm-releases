// POST /hit: one row per page view, DMG click or Buy click (checkout) on the published site.
// Stores no IP and no user agent (only mobile or desktop, decided by the site); the country is Cloudflare's guess (request.cf.country).
// A DMG click is also announced on Discord #downloads, after the response (notify.ts).
import { announceDownload } from "./notify";

export interface Env { DB: D1Database; DISCORD_DOWNLOADS_WEBHOOK?: string }

// The old GitHub Pages address stays allowed: it redirects to the custom domain, but tabs opened
// before the switch still send from there.
export const ORIGINS = new Set(["https://linerfm.xyz", "https://www.linerfm.xyz", "https://whoismars.github.io"]);
export const BOT = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|embedly|lighthouse/i;
const FIELDS = {
  k: /^(view|download|checkout)$/,
  p: /^\/[^\s]{0,199}$/,
  r: /^[a-z0-9.-]{0,100}$/,
  s: /^[a-z0-9_-]{0,40}$/,
  a: /^[a-z0-9_-]{0,20}$/,
  i: /^[a-f0-9]{8,32}$/,
} as const;
// Telefono o tablet contro computer, deciso dal sito (html.ua-mobile): mai lo user agent.
// Facoltativo: le schede aperte prima di questo campo non lo mandano.
const CLIENT = /^(mobile|desktop)$/;

const reply = (status: number, origin = "https://linerfm.xyz") =>
  new Response(null, { status, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } });

export async function handleHit(req: Request, env: Env, country: string, now: number, ctx?: ExecutionContext, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  if (!ORIGINS.has(origin)) return reply(403);
  if (BOT.test(req.headers.get("User-Agent") ?? "")) return reply(204, origin);
  const raw = await req.text();
  if (raw.length > 1024) return reply(400, origin);
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return reply(400, origin); }
  for (const [f, re] of Object.entries(FIELDS)) {
    if (typeof b[f] !== "string" || !re.test(b[f] as string)) return reply(400, origin);
  }
  if (b.d !== undefined && (typeof b.d !== "string" || !CLIENT.test(b.d))) return reply(400, origin);
  const client = (b.d as string | undefined) ?? "";
  const cc = country.slice(0, 2);
  // senza la migrazione 0003_hits_client.sql la colonna client non c'è: la visita si salva senza
  await env.DB.prepare("INSERT INTO hits (ts, kind, path, ref, src, arch, sid, country, client) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(now, b.k, b.p, b.r, b.s, b.a, b.i, cc, client)
    .run()
    .catch(() => env.DB.prepare("INSERT INTO hits (ts, kind, path, ref, src, arch, sid, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(now, b.k, b.p, b.r, b.s, b.a, b.i, cc)
      .run());
  // da telefono il file scaricato non si apre: si conta, ma non si annuncia come un download vero
  if (b.k === "download" && client !== "mobile" && ctx) {
    ctx.waitUntil(announceDownload(env, { ts: now, arch: b.a as string, src: b.s as string, ref: b.r as string, sid: b.i as string, country: cc }, fetchImpl));
  }
  return reply(204, origin);
}
