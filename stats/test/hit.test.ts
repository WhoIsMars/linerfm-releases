import { describe, it, expect } from "vitest";
import { handleHit } from "../src/hit";

function fakeDB() {
  const rows: unknown[][] = [];
  const db = {
    prepare: (_sql: string) => ({ bind: (...v: unknown[]) => ({ run: async () => { rows.push(v); return {}; } }) }),
  } as unknown as D1Database;
  return { db, rows };
}

const ORIGIN = "https://whoismars.github.io";
const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const VIEW = { k: "view", p: "/linerfm-releases/", r: "www.reddit.com", s: "tiktok", a: "", i: "0123456789abcdef" };

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://stats.example/hit", {
    method: "POST",
    headers: { Origin: ORIGIN, "User-Agent": UA_MAC, "Content-Type": "text/plain", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("handleHit", () => {
  it("stores a valid view with the country and without the IP", async () => {
    const { db, rows } = fakeDB();
    const res = await handleHit(req(VIEW, { "CF-Connecting-IP": "1.2.3.4" }), { DB: db }, "IT", 1_700_000_000_000);
    expect(res.status).toBe(204);
    expect(rows).toEqual([[1_700_000_000_000, "view", "/linerfm-releases/", "www.reddit.com", "tiktok", "", "0123456789abcdef", "IT"]]);
    expect(JSON.stringify(rows)).not.toContain("1.2.3.4");
  });

  it("stores a download with its architecture", async () => {
    const { db, rows } = fakeDB();
    await handleHit(req({ ...VIEW, k: "download", a: "apple-silicon" }), { DB: db }, "DE", 1);
    expect(rows[0][1]).toBe("download");
    expect(rows[0][5]).toBe("apple-silicon");
  });

  it("refuses other origins", async () => {
    const { db, rows } = fakeDB();
    const res = await handleHit(req(VIEW, { Origin: "https://evil.example" }), { DB: db }, "IT", 1);
    expect(res.status).toBe(403);
    expect(rows).toHaveLength(0);
  });

  it("refuses unknown kinds and malformed fields", async () => {
    const { db, rows } = fakeDB();
    for (const bad of [{ ...VIEW, k: "purchase" }, { ...VIEW, i: "not-hex!" }, { ...VIEW, p: "https://x" }, { ...VIEW, r: "a b" }, "not json"]) {
      expect((await handleHit(req(bad), { DB: db }, "IT", 1)).status).toBe(400);
    }
    expect(rows).toHaveLength(0);
  });

  it("refuses bodies over 1 KB", async () => {
    const { db, rows } = fakeDB();
    const res = await handleHit(req({ ...VIEW, p: "/" + "x".repeat(1100) }), { DB: db }, "IT", 1);
    expect(res.status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  it("ignores bots and headless browsers without storing", async () => {
    const { db, rows } = fakeDB();
    for (const ua of ["Googlebot/2.1", "Mozilla/5.0 HeadlessChrome/120", "facebookexternalhit/1.1"]) {
      expect((await handleHit(req(VIEW, { "User-Agent": ua }), { DB: db }, "US", 1)).status).toBe(204);
    }
    expect(rows).toHaveLength(0);
  });
});
