// Consenso al pixel TikTok e passaggio degli identificativi al checkout.
// Logica pura: il banner (components/ConsentBanner.astro) ci passa storage e DOM.
//
// Il percorso di un acquisto: il pixel gira solo dopo "Accept"; al click su Buy il
// link di Lemon Squeezy riceve `checkout[custom][tt_consent]=1` più ttclid e _ttp;
// Lemon Squeezy li rimanda nel webhook order_created (`meta.custom_data`) e il
// worker (linerfm/worker/src/tiktok.ts) manda il Purchase lato server solo se
// tt_consent è "1".

export type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Consent = "granted" | "denied";

const CONSENT_KEY = "linerfm.tt-consent";
const TTCLID_KEY = "linerfm.ttclid";

// Lo storage può lanciare (Safari privato, dati bloccati): si degrada a "nessuna scelta".
function safe<T>(f: () => T, fallback: T): T {
  try { return f(); } catch { return fallback; }
}

export function readConsent(s: KV): Consent | null {
  const v = safe(() => s.getItem(CONSENT_KEY), null);
  return v === "granted" || v === "denied" ? v : null;
}

export function writeConsent(s: KV, c: Consent): void {
  safe(() => s.setItem(CONSENT_KEY, c), undefined);
}

export function readStoredTtclid(s: KV): string | null {
  return safe(() => s.getItem(TTCLID_KEY), null);
}

export function storeTtclid(s: KV, v: string): void {
  safe(() => s.setItem(TTCLID_KEY, v), undefined);
}

/** Toglie gli identificativi salvati da noi (il cookie _ttp lo cancella il banner). */
export function clearTracking(s: KV): void {
  safe(() => s.removeItem(TTCLID_KEY), undefined);
}

/** ttclid: TikTok lo appende alla landing di chi clicca un annuncio. */
export function ttclidFrom(search: string): string | null {
  return new URLSearchParams(search).get("ttclid") || null;
}

export function readCookie(cookies: string, name: string): string | null {
  for (const part of cookies.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const CUSTOM = (k: string) => `checkout[custom][${k}]`;

/** Il link di checkout con il consenso e gli identificativi come custom data. */
export function checkoutUrl(href: string, ids: { ttclid: string | null; ttp: string | null }): string {
  const u = new URL(href);
  u.searchParams.set(CUSTOM("tt_consent"), "1");
  for (const k of ["ttclid", "ttp"] as const) {
    const v = ids[k];
    if (v) u.searchParams.set(CUSTOM(k), v);
    else u.searchParams.delete(CUSTOM(k));
  }
  return u.toString();
}

/** Purchase lato browser dall'evento Checkout.Success di lemon.js. event_id è l'id
 * ordine, lo stesso del worker: TikTok deduplica su event_source_id + event + event_id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function purchaseFromCheckout(e: any): { event_id: string; value: number; currency: string } | null {
  if (e?.event !== "Checkout.Success" || e?.data?.id == null) return null;
  const a = e.data.attributes ?? {};
  return { event_id: String(e.data.id), value: Number(a.total ?? 0) / 100, currency: String(a.currency ?? "EUR") };
}
