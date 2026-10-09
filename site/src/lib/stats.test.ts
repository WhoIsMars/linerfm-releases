import { describe, expect, it } from "vitest";
import { shouldCount, hitPayload, optOutFromSearch } from "./stats";

describe("shouldCount", () => {
  const ok = { hostname: "whoismars.github.io", webdriver: false, optedOut: false };
  it("counts a real visitor on the published site", () => {
    expect(shouldCount(ok)).toBe(true);
  });
  it("skips localhost and previews", () => {
    expect(shouldCount({ ...ok, hostname: "localhost" })).toBe(false);
    expect(shouldCount({ ...ok, hostname: "127.0.0.1" })).toBe(false);
  });
  it("skips automated browsers (Playwright sets navigator.webdriver)", () => {
    expect(shouldCount({ ...ok, webdriver: true })).toBe(false);
  });
  it("skips browsers that opted out with ?notrack=1", () => {
    expect(shouldCount({ ...ok, optedOut: true })).toBe(false);
  });
});

describe("optOutFromSearch", () => {
  it("reads ?notrack=1 and ?notrack=0", () => {
    expect(optOutFromSearch("?notrack=1")).toBe("on");
    expect(optOutFromSearch("?a=b&notrack=0")).toBe("off");
    expect(optOutFromSearch("?src=tiktok")).toBe(null);
  });
});

describe("hitPayload", () => {
  const base = { kind: "view" as const, pathname: "/linerfm-releases/", referrer: "", search: "", ownHost: "whoismars.github.io", sid: "abc123def456", sessionSrc: "" };

  it("keeps only the referrer host, never the full URL", () => {
    const p = hitPayload({ ...base, referrer: "https://www.reddit.com/r/macapps/comments/xyz?utm=1" });
    expect(p.r).toBe("www.reddit.com");
  });
  it("drops internal navigation as referrer", () => {
    expect(hitPayload({ ...base, referrer: "https://whoismars.github.io/linerfm-releases/changelog" }).r).toBe("");
  });
  it("takes the source from ?src= or ?utm_source=, lowercased and cleaned", () => {
    expect(hitPayload({ ...base, search: "?src=TikTok" }).s).toBe("tiktok");
    expect(hitPayload({ ...base, search: "?utm_source=ig<script>" }).s).toBe("igscript");
  });
  it("falls back to the source seen earlier in the same session", () => {
    expect(hitPayload({ ...base, sessionSrc: "youtube" }).s).toBe("youtube");
  });
  it("carries the architecture only on downloads", () => {
    expect(hitPayload({ ...base, kind: "download", arch: "intel" }).a).toBe("intel");
    expect(hitPayload({ ...base, arch: "intel" }).a).toBe("");
  });
});

describe("track", () => {
  // Regression, 2026-10-09: on the live site Chrome's sendBeacon got HTTP 503 from
  // workers.dev on every call, while fetch with keepalive and no credentials got 204.
  it("sends with fetch keepalive and no credentials, never sendBeacon", async () => {
    const { vi } = await import("vitest");
    const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    const beacon = vi.fn(() => true);
    vi.stubGlobal("location", { hostname: "whoismars.github.io", pathname: "/linerfm-releases/", search: "?src=tiktok" });
    vi.stubGlobal("navigator", { webdriver: false, sendBeacon: beacon });
    vi.stubGlobal("document", { referrer: "" });
    vi.stubGlobal("localStorage", mem());
    vi.stubGlobal("sessionStorage", mem());
    vi.stubGlobal("fetch", fetchSpy);
    const { track } = await import("./stats");
    track("download", "intel");
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
    expect(JSON.parse(await (init.body as Blob).text())).toMatchObject({ k: "download", a: "intel", s: "tiktok" });
    vi.unstubAllGlobals();
  });
});
