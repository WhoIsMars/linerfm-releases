// Visit and download counting for the published site, without cookies.
// Sends one small beacon per page view and per DMG click to the stats worker
// (`stats/` in this repo). Stored server side: path, referrer host, ?src= tag,
// architecture, a random per-tab id, country. No IP, no user agent, no cookie.
import { STATS_URL } from "../config/links";

const PUBLISHED_HOST = "whoismars.github.io";
const OPT_OUT_KEY = "lfm_notrack";
const SID_KEY = "lfm_sid";
const SRC_KEY = "lfm_src";

/** Only real visitors on the published site: not localhost, not Playwright, not the owner. */
export function shouldCount(o: { hostname: string; webdriver: boolean; optedOut: boolean }): boolean {
  return o.hostname === PUBLISHED_HOST && !o.webdriver && !o.optedOut;
}

/** `?notrack=1` excludes this browser for good, `?notrack=0` counts it again. */
export function optOutFromSearch(search: string): "on" | "off" | null {
  const v = new URLSearchParams(search).get("notrack");
  return v === "1" ? "on" : v === "0" ? "off" : null;
}

const clean = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);

export function hitPayload(o: {
  kind: "view" | "download"; pathname: string; referrer: string; search: string;
  ownHost: string; sid: string; sessionSrc: string; arch?: string;
}) {
  let r = "";
  try { const h = new URL(o.referrer).hostname; if (h !== o.ownHost) r = h; } catch { /* no referrer */ }
  const q = new URLSearchParams(o.search);
  return {
    k: o.kind,
    p: o.pathname.slice(0, 200),
    r: r.slice(0, 100),
    s: clean(q.get("src") ?? q.get("utm_source")) || o.sessionSrc,
    a: o.kind === "download" ? clean(o.arch ?? "") : "",
    i: o.sid,
  };
}

function store(kind: "local" | "session"): Storage | null {
  try { return kind === "local" ? localStorage : sessionStorage; } catch { return null; }
}

/**
 * Fire-and-forget hit. text/plain keeps it a simple request (no CORS preflight);
 * keepalive lets a DMG click survive the navigation to GitHub. Not sendBeacon:
 * on the live site Chrome's beacons got HTTP 503 from workers.dev every time
 * (2026-10-09), while this same fetch got 204.
 */
export function track(kind: "view" | "download", arch?: string): void {
  const local = store("local");
  const session = store("session");
  const opt = optOutFromSearch(location.search);
  if (opt === "on") local?.setItem(OPT_OUT_KEY, "1");
  if (opt === "off") local?.removeItem(OPT_OUT_KEY);
  if (!shouldCount({ hostname: location.hostname, webdriver: navigator.webdriver, optedOut: local?.getItem(OPT_OUT_KEY) === "1" })) return;

  let sid = session?.getItem(SID_KEY) ?? "";
  if (!sid) { sid = crypto.randomUUID().replace(/-/g, "").slice(0, 16); session?.setItem(SID_KEY, sid); }
  const p = hitPayload({
    kind, pathname: location.pathname, referrer: document.referrer, search: location.search,
    ownHost: location.hostname, sid, sessionSrc: session?.getItem(SRC_KEY) ?? "", arch,
  });
  if (p.s) session?.setItem(SRC_KEY, p.s);
  const body = new Blob([JSON.stringify(p)], { type: "text/plain" });
  fetch(STATS_URL, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {});
}
