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
