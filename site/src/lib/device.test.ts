import { describe, it, expect } from "vitest";
import { isMobileUA } from "./device";

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
