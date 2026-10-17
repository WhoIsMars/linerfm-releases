// POST /hit: one row per page view or DMG click on the published site.
// Stores no IP and no user agent; the country is Cloudflare's guess (request.cf.country).
// A DMG click is also announced on Discord #downloads, after the response (notify.ts).
import { announceDownload } from "./notify";

export interface Env { DB: D1Database; DISCORD_DOWNLOADS_WEBHOOK?: string }

const ORIGIN = "https://whoismars.github.io";
const BOT = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|embedly|lighthouse/i;
const FIELDS = {
  k: /^(view|download)$/,
  p: /^\/[^\s]{0,199}$/,
  r: /^[a-z0-9.-]{0,100}$/,
  s: /^[a-z0-9_-]{0,40}$/,
  a: /^[a-z0-9_-]{0,20}$/,
  i: /^[a-f0-9]{8,32}$/,
} as const;

const reply = (status: number) => new Response(null, { status, headers: { "Access-Control-Allow-Origin": ORIGIN } });

export async function handleHit(req: Request, env: Env, country: string, now: number, ctx?: ExecutionContext, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.headers.get("Origin") !== ORIGIN) return reply(403);
  if (BOT.test(req.headers.get("User-Agent") ?? "")) return reply(204);
  const raw = await req.text();
  if (raw.length > 1024) return reply(400);
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return reply(400); }
  for (const [f, re] of Object.entries(FIELDS)) {
    if (typeof b[f] !== "string" || !re.test(b[f] as string)) return reply(400);
  }
  await env.DB.prepare("INSERT INTO hits (ts, kind, path, ref, src, arch, sid, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(now, b.k, b.p, b.r, b.s, b.a, b.i, country.slice(0, 2))
    .run();
  if (b.k === "download" && ctx) {
    ctx.waitUntil(announceDownload(env, { ts: now, arch: b.a as string, src: b.s as string, ref: b.r as string, sid: b.i as string, country: country.slice(0, 2) }, fetchImpl));
  }
  return reply(204);
}
