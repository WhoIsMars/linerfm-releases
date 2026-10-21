import { describe, it, expect } from "vitest";
import { handleLead, normalizeEmail } from "../src/lead";
import worker from "../src/index";

// D1 finto che risponde solo ai metodi davvero usati: un metodo mancante lancia, non torna undefined.
function fakeDB(existing: string[] = []) {
  const rows: unknown[][] = [];
  const emails = new Set(existing);
  const db = {
    prepare: (sql: string) => ({
      bind: (...v: unknown[]) => ({
        run: async () => {
          if (!/^INSERT OR IGNORE INTO leads/.test(sql)) throw new Error("unexpected SQL: " + sql);
          if (emails.has(v[1] as string)) return { meta: { changes: 0 } };
          emails.add(v[1] as string);
          rows.push(v);
          return { meta: { changes: 1 } };
        },
      }),
    }),
  } as unknown as D1Database;
  return { db, rows };
}

// Il binding ratelimit di Cloudflare: conta le chiavi viste, permette `limit` chiamate per chiave.
function fakeLimiter(limit = 5) {
  const seen = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    limiter: { limit: async ({ key }: { key: string }) => { keys.push(key); const n = (seen.get(key) ?? 0) + 1; seen.set(key, n); return { success: n <= limit }; } },
  };
}

const ORIGIN = "https://linerfm.xyz";
const UA_PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const LEAD = { e: "Someone@Example.com ", s: "tiktok" };

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://stats.example/lead", {
    method: "POST",
    headers: { Origin: ORIGIN, "User-Agent": UA_PHONE, "Content-Type": "text/plain", "CF-Connecting-IP": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("normalizeEmail", () => {
  it("trims and lowercases a plain address", () => {
    expect(normalizeEmail("  Someone@Example.COM ")).toBe("someone@example.com");
  });
  it("accepts plus tags, dots and subdomains", () => {
    expect(normalizeEmail("a.b+reel@mail.co.uk")).toBe("a.b+reel@mail.co.uk");
  });
  it("refuses what is not an address", () => {
    for (const bad of ["", "nobody", "a@b", "@example.com", "a@@example.com", "a b@example.com", "a@example.com\nBcc: x@y.z", "a@.com", "a@example.", "a@exa_mple.com", "x".repeat(250) + "@ex.com"]) {
      expect(normalizeEmail(bad), bad).toBeNull();
    }
  });
});

describe("handleLead", () => {
  it("stores a valid lead with src and country, never the IP", async () => {
    const { db, rows } = fakeDB();
    const { limiter } = fakeLimiter();
    const res = await handleLead(req(LEAD), { DB: db, LEAD_LIMIT: limiter }, "IT", 1_700_000_000_000);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(rows).toEqual([[1_700_000_000_000, "someone@example.com", "tiktok", "IT"]]);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.7");
  });

  it("keys the rate limit on the IP without storing it", async () => {
    const { db } = fakeDB();
    const { limiter, keys } = fakeLimiter();
    await handleLead(req(LEAD), { DB: db, LEAD_LIMIT: limiter }, "IT", 1);
    expect(keys).toEqual(["203.0.113.7"]);
  });

  it("answers 429 and stores nothing once the IP is over the limit", async () => {
    const { db, rows } = fakeDB();
    const { limiter } = fakeLimiter(5);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await handleLead(req({ e: `p${i}@example.com`, s: "" }), { DB: db, LEAD_LIMIT: limiter }, "IT", i)).status);
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
    expect(rows).toHaveLength(5);
  });

  it("does not store the same address twice and does not tell the caller", async () => {
    const { db, rows } = fakeDB(["someone@example.com"]);
    const res = await handleLead(req(LEAD), { DB: db, LEAD_LIMIT: fakeLimiter().limiter }, "IT", 1);
    expect(res.status).toBe(204);
    expect(rows).toHaveLength(0);
  });

  it("keeps an empty src and refuses a malformed one", async () => {
    const { db, rows } = fakeDB();
    const env = { DB: db, LEAD_LIMIT: fakeLimiter().limiter };
    expect((await handleLead(req({ e: "a@example.com", s: "" }), env, "", 1)).status).toBe(204);
    expect(rows[0]).toEqual([1, "a@example.com", "", ""]);
    expect((await handleLead(req({ e: "b@example.com", s: "Tik Tok!" }), env, "IT", 1)).status).toBe(400);
    expect(rows).toHaveLength(1);
  });

  it("refuses bad emails, bad JSON and bodies over 1 KB", async () => {
    const { db, rows } = fakeDB();
    const env = { DB: db, LEAD_LIMIT: fakeLimiter(100).limiter };
    for (const bad of [{ e: "nobody", s: "" }, { s: "tiktok" }, { e: 42, s: "" }, "not json", { e: "a@example.com", s: "x".repeat(1100) }]) {
      expect((await handleLead(req(bad), env, "IT", 1)).status).toBe(400);
    }
    expect(rows).toHaveLength(0);
  });

  it("refuses other origins, look-alikes included", async () => {
    const { db, rows } = fakeDB();
    for (const origin of ["https://evil.example", "http://linerfm.xyz", "https://linerfm.xyz.evil.example", ""]) {
      expect((await handleLead(req(LEAD, { Origin: origin }), { DB: db, LEAD_LIMIT: fakeLimiter().limiter }, "IT", 1)).status).toBe(403);
    }
    expect(rows).toHaveLength(0);
  });

  it("ignores bots without storing", async () => {
    const { db, rows } = fakeDB();
    expect((await handleLead(req(LEAD, { "User-Agent": "Googlebot/2.1" }), { DB: db, LEAD_LIMIT: fakeLimiter().limiter }, "US", 1)).status).toBe(204);
    expect(rows).toHaveLength(0);
  });

  it("still works without the limiter binding (local dev, tests)", async () => {
    const { db, rows } = fakeDB();
    expect((await handleLead(req(LEAD), { DB: db }, "IT", 1)).status).toBe(204);
    expect(rows).toHaveLength(1);
  });
});

describe("worker routing", () => {
  it("routes POST /lead and turns a D1 failure into a 500", async () => {
    const db = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error("D1 down"); } }) }) } as unknown as D1Database;
    const res = await worker.fetch(req(LEAD), { DB: db } as never);
    expect(res.status).toBe(500);
  });

  it("does not accept GET /lead (nothing goes in a query string)", async () => {
    const { db, rows } = fakeDB();
    const res = await worker.fetch(new Request("https://stats.example/lead?e=a@example.com", { headers: { Origin: ORIGIN } }), { DB: db } as never);
    expect(res.status).toBe(404);
    expect(rows).toHaveLength(0);
  });
});
