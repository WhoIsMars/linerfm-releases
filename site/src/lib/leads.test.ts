import { describe, expect, it } from "vitest";
import { isValidEmail, leadPayload, isMobileUA, leadMessage } from "./leads";

describe("isValidEmail", () => {
  it("accepts ordinary addresses, with spaces around and capitals", () => {
    for (const ok of ["someone@example.com", " Someone@Example.COM ", "a.b+reel@mail.co.uk"]) expect(isValidEmail(ok), ok).toBe(true);
  });
  it("refuses what the worker would refuse", () => {
    for (const bad of ["", "nobody", "a@b", "@example.com", "a@@example.com", "a b@example.com", "a@.com", "a@example."]) expect(isValidEmail(bad), bad).toBe(false);
  });
});

describe("leadPayload", () => {
  it("sends the cleaned address and the ?src= of this visit", () => {
    expect(leadPayload({ email: " Me@Example.com ", search: "?src=TikTok", sessionSrc: "" })).toEqual({ e: "me@example.com", s: "tiktok" });
  });
  it("falls back to utm_source, then to the src remembered for the tab", () => {
    expect(leadPayload({ email: "me@example.com", search: "?utm_source=ig", sessionSrc: "x" }).s).toBe("ig");
    expect(leadPayload({ email: "me@example.com", search: "", sessionSrc: "reddit" }).s).toBe("reddit");
    expect(leadPayload({ email: "me@example.com", search: "", sessionSrc: "" }).s).toBe("");
  });
  it("strips characters the worker would refuse from src", () => {
    expect(leadPayload({ email: "me@example.com", search: "?src=Tik%20Tok!", sessionSrc: "" }).s).toBe("tiktok");
  });
});

describe("isMobileUA", () => {
  it("spots iPhone, Android phones and iPads that pretend to be a Mac", () => {
    expect(isMobileUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148", 5)).toBe(true);
    expect(isMobileUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36", 5)).toBe(true);
    expect(isMobileUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)).toBe(true);
  });
  it("leaves real Macs and PCs alone", () => {
    expect(isMobileUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0)).toBe(false);
    expect(isMobileUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", 0)).toBe(false);
  });
});

describe("leadMessage", () => {
  it("has a plain line for each answer of the worker, no em dash", () => {
    const all = [204, 400, 429, 500, 0].map(leadMessage);
    expect(all[0].ok).toBe(true);
    expect(all.slice(1).every((m) => !m.ok)).toBe(true);
    expect(all.map((m) => m.text).join(" ")).not.toMatch(/—|--/);
    expect(all[2].text).not.toBe(all[3].text);
  });
});
