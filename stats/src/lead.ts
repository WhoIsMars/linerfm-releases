// POST /lead: an email left on the site by someone on a phone, so the owner can send them the
// download link for their Mac or PC. Body is text/plain JSON {e, s}, never a query string.
// Stored: time, address, ?src= tag, Cloudflare's country. The IP is used only as the key of the
// Cloudflare rate limiter (LEAD_LIMIT, wrangler.toml) and is never written anywhere.
// A new address gets the download link at once through Resend (secret RESEND_API_KEY, domain
// linerfm.xyz verified there), and sent_ts marks it; without the key, or if Resend fails, the
// address stays unsent and scripts/leads.mjs lists it for a manual send. One mail per address, ever.
import { ORIGINS, BOT } from "./hit";

export interface Env { DB: D1Database; LEAD_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> }; RESEND_API_KEY?: string }

// Same subject and text as the manual mailto in scripts/leads.mjs (test/leads-script.test.ts checks it).
export const LINK_SUBJECT = "Your LinerFM download link";
export const LINK_TEXT = `Hi,

here is the link to download LinerFM on your Mac or PC:
https://linerfm.xyz/?src=email#download

It's free for 5 days, no card and no account. Open it on your computer and pick Mac or Windows.

LinerFM`;

async function sendLink(env: Env, email: string, now: number, fetchImpl: typeof fetch): Promise<void> {
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "LinerFM <hello@linerfm.xyz>", to: [email], reply_to: "hello@linerfm.xyz", subject: LINK_SUBJECT, text: LINK_TEXT }),
    });
    if (!res.ok) return;
    // senza la migrazione 0004_leads_sent.sql la colonna non c'è: la mail è partita lo stesso
    await env.DB.prepare("UPDATE leads SET sent_ts = ? WHERE email = ?").bind(now, email).run().catch(() => undefined);
  } catch { /* Resend irraggiungibile: resta nella lista a mano */ }
}

const SRC = /^[a-z0-9_-]{0,40}$/;
// Local part without spaces or a second @; domain of letters, digits and hyphens, with a dot and a TLD.
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function normalizeEmail(s: string): string | null {
  const e = s.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

const reply = (status: number, origin = "https://linerfm.xyz") =>
  new Response(null, { status, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } });

export async function handleLead(req: Request, env: Env, country: string, now: number, ctx?: ExecutionContext, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  if (!ORIGINS.has(origin)) return reply(403);
  if (BOT.test(req.headers.get("User-Agent") ?? "")) return reply(204, origin);
  const ip = req.headers.get("CF-Connecting-IP") ?? "";
  if (env.LEAD_LIMIT && !(await env.LEAD_LIMIT.limit({ key: ip })).success) return reply(429, origin);
  const raw = await req.text();
  if (raw.length > 1024) return reply(400, origin);
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return reply(400, origin); }
  const email = typeof b.e === "string" ? normalizeEmail(b.e) : null;
  const src = typeof b.s === "string" && SRC.test(b.s) ? b.s : null;
  if (!email || src === null) return reply(400, origin);
  // Same address twice: one row, and the caller gets the same answer either way.
  const r = await env.DB.prepare("INSERT OR IGNORE INTO leads (ts, email, src, country) VALUES (?, ?, ?, ?)")
    .bind(now, email, src, country.slice(0, 2))
    .run();
  if (env.RESEND_API_KEY && r.meta?.changes === 1) {
    const send = sendLink(env, email, now, fetchImpl);
    if (ctx) ctx.waitUntil(send); else await send;
  }
  return reply(204, origin);
}
