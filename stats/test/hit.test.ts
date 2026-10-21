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
    expect(rows).toEqual([[1_700_000_000_000, "view", "/linerfm-releases/", "www.reddit.com", "tiktok", "", "0123456789abcdef", "IT", ""]]);
    expect(JSON.stringify(rows)).not.toContain("1.2.3.4");
  });

  it("stores whether the visit came from a phone or a computer, '' from tabs opened before the field existed", async () => {
    const { db, rows } = fakeDB();
    await handleHit(req({ ...VIEW, d: "mobile" }), { DB: db }, "IT", 1);
    await handleHit(req({ ...VIEW, d: "desktop" }), { DB: db }, "IT", 1);
    await handleHit(req(VIEW), { DB: db }, "IT", 1);
    expect(rows.map((r) => r[8])).toEqual(["mobile", "desktop", ""]);
  });

  it("refuses a device value that is not mobile or desktop", async () => {
    const { db, rows } = fakeDB();
    for (const d of ["phone", "Mozilla/5.0 (iPhone)", 1]) {
      expect((await handleHit(req({ ...VIEW, d }), { DB: db }, "IT", 1)).status).toBe(400);
    }
    expect(rows).toHaveLength(0);
  });

  // Il worker può partire prima della migrazione 0003: la visita si salva lo stesso, senza il dispositivo.
  it("still stores the visit when the hits table has no client column yet", async () => {
    const rows: unknown[][] = [];
    const db = {
      prepare: (sql: string) => ({ bind: (...v: unknown[]) => ({ run: async () => {
        if (sql.includes("client")) throw new Error("D1_ERROR: table hits has no column named client");
        rows.push(v); return {};
      } }) }),
    } as unknown as D1Database;
    const res = await handleHit(req({ ...VIEW, d: "mobile" }), { DB: db }, "IT", 1);
    expect(res.status).toBe(204);
    expect(rows).toHaveLength(1);
  });

  it("stores a download with its architecture", async () => {
    const { db, rows } = fakeDB();
    await handleHit(req({ ...VIEW, k: "download", a: "apple-silicon" }), { DB: db }, "DE", 1);
    expect(rows[0][1]).toBe("download");
    expect(rows[0][5]).toBe("apple-silicon");
  });

  // Il clic su Buy: dice da quale canale arriva chi apre il checkout, senza annunciarlo come download.
  it("stores a checkout open with its source and does not announce it as a download", async () => {
    const { db, rows } = fakeDB();
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as ExecutionContext;
    const res = await handleHit(req({ ...VIEW, k: "checkout", s: "reddit-macapps" }), { DB: db }, "US", 1, ctx);
    expect(res.status).toBe(204);
    expect(rows[0][1]).toBe("checkout");
    expect(rows[0][4]).toBe("reddit-macapps");
    expect(waits).toHaveLength(0);
  });

  it("refuses an unknown kind", async () => {
    const { db, rows } = fakeDB();
    expect((await handleHit(req({ ...VIEW, k: "purchase" }), { DB: db }, "IT", 1)).status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  it("accepts the custom domain and answers with its own origin for CORS", async () => {
    for (const origin of ["https://linerfm.xyz", "https://www.linerfm.xyz"]) {
      const { db, rows } = fakeDB();
      const res = await handleHit(req(VIEW, { Origin: origin }), { DB: db }, "IT", 1);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(rows).toHaveLength(1);
    }
  });

  it("refuses look-alike hosts of the custom domain", async () => {
    const { db, rows } = fakeDB();
    for (const origin of ["http://linerfm.xyz", "https://linerfm.xyz.evil.example", "https://evillinerfm.xyz"]) {
      expect((await handleHit(req(VIEW, { Origin: origin }), { DB: db }, "IT", 1)).status).toBe(403);
    }
    expect(rows).toHaveLength(0);
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
