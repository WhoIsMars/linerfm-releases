// The "email me the link" box for visitors on a phone (components/LeadForm.astro), in #download above the installers.
// They can't install a desktop app there, so they leave an email and the owner sends the
// download link later. The address goes in a POST body to the stats worker (stats/src/lead.ts),
// never in a URL. Same rule as the worker, so a typo is caught before the round trip.
import { LEAD_URL } from "../config/links";
import { clean, rememberedSrc } from "./stats";

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function isValidEmail(s: string): boolean {
  const e = s.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e);
}

export function leadPayload(o: { email: string; search: string; sessionSrc: string }): { e: string; s: string } {
  const q = new URLSearchParams(o.search);
  return { e: o.email.trim().toLowerCase(), s: clean(q.get("src") ?? q.get("utm_source")) || clean(o.sessionSrc) };
}

export function leadMessage(status: number): { ok: boolean; text: string } {
  if (status >= 200 && status < 300) return { ok: true, text: "Got it. We'll email you the download link soon. Open it on your Mac or PC." };
  if (status === 400) return { ok: false, text: "That email doesn't look right. Check it and try again." };
  if (status === 429) return { ok: false, text: "Too many tries. Wait a minute and send it again." };
  return { ok: false, text: "Couldn't send it. Check your connection and try again." };
}

export async function sendLead(email: string): Promise<{ ok: boolean; text: string }> {
  const body = new Blob([JSON.stringify(leadPayload({ email, search: location.search, sessionSrc: rememberedSrc() }))], { type: "text/plain" });
  try {
    const res = await fetch(LEAD_URL, { method: "POST", body, credentials: "omit" });
    return leadMessage(res.status);
  } catch {
    return leadMessage(0);
  }
}
