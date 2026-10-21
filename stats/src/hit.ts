// POST /hit: one row per page view or DMG click on the published site.
// Stores no IP and no user agent; the country is Cloudflare's guess (request.cf.country).
export interface Env { DB: D1Database }

// The old GitHub Pages address stays allowed: it redirects to the custom domain, but tabs opened
// before the switch still send from there.
const ORIGINS = new Set(["https://linerfm.xyz", "https://www.linerfm.xyz", "https://whoismars.github.io"]);
const BOT = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|embedly|lighthouse/i;
const FIELDS = {
  k: /^(view|download)$/,
  p: /^\/[^\s]{0,199}$/,
  r: /^[a-z0-9.-]{0,100}$/,
  s: /^[a-z0-9_-]{0,40}$/,
  a: /^[a-z0-9_-]{0,20}$/,
  i: /^[a-f0-9]{8,32}$/,
} as const;

const reply = (status: number, origin = "https://linerfm.xyz") =>
  new Response(null, { status, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } });

export async function handleHit(req: Request, env: Env, country: string, now: number): Promise<Response> {
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
  await env.DB.prepare("INSERT INTO hits (ts, kind, path, ref, src, arch, sid, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(now, b.k, b.p, b.r, b.s, b.a, b.i, country.slice(0, 2))
    .run();
  return reply(204, origin);
}
