import { describe, it, expect } from "vitest";
import { handleDashboard, summarize, type Row } from "../src/dashboard";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

const v = (sid: string, a: Partial<Row> = {}): Row => ({ ts: NOW - 1000, kind: "view", ref: "", src: "", arch: "", sid, country: "IT", ...a });
const d = (sid: string, a: Partial<Row> = {}): Row => ({ ...v(sid), kind: "download", arch: "apple-silicon", ...a });

function fakeDB(rows: Row[]) {
  const calls: unknown[][] = [];
  const db = {
    prepare: (_sql: string) => ({ bind: (...b: unknown[]) => ({ all: async () => { calls.push(b); return { results: rows }; } }) }),
  } as unknown as D1Database;
  return { db, calls };
}

const basic = (pw: string) => ({ Authorization: "Basic " + btoa("owner:" + pw) });
const get = (headers: Record<string, string> = {}) => new Request("https://stats.example/dashboard", { headers });
const noGithub = async () => new Response("[]", { status: 200 });

describe("handleDashboard", () => {
  it("is closed when no password is configured, without touching the database", async () => {
    const { db, calls } = fakeDB([v("a")]);
    const res = await handleDashboard(get(basic("x")), { DB: db }, NOW, noGithub);
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("asks for a password when it is missing or wrong", async () => {
    const { db, calls } = fakeDB([v("a")]);
    for (const h of [{}, basic("wrong"), { Authorization: "Bearer secret" }]) {
      const res = await handleDashboard(get(h), { DB: db, DASH_PASSWORD: "secret" }, NOW, noGithub);
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
    }
    expect(calls).toHaveLength(0);
  });

  it("shows the last 30 days to the owner, never cached nor indexed", async () => {
    const { db, calls } = fakeDB([v("a", { src: "tiktok" }), d("a"), v("b", { ref: "www.reddit.com" })]);
    const res = await handleDashboard(get(basic("secret")), { DB: db, DASH_PASSWORD: "secret" }, NOW, noGithub);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(calls[0]).toEqual([NOW - 30 * DAY]);
    const html = await res.text();
    expect(html).toContain("TikTok");
    expect(html).toContain("Reddit");
  });

  it("escapes what it prints", async () => {
    const { db } = fakeDB([v("a", { src: "<img src=x onerror=alert(1)>" })]);
    const res = await handleDashboard(get(basic("secret")), { DB: db, DASH_PASSWORD: "secret" }, NOW, noGithub);
    const html = await res.text();
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("summarize", () => {
  it("counts a visit per tab, takes the source from ?src, then the referrer, then direct", () => {
    const s = summarize([
      v("a", { src: "tiktok" }), v("a"), d("a"),
      v("b", { ref: "www.reddit.com" }),
      v("c"),
      d("x", { arch: "intel", country: "US" }),
    ], NOW);
    expect(s.visits).toBe(3);
    expect(s.downloads).toBe(2);
    // stesse visite: prima chi ha portato download
    expect(s.bySource).toEqual([["tiktok", 1, 1], ["diretto", 1, 1], ["www.reddit.com", 1, 0]]);
    expect(s.days[s.days.length - 1]).toEqual({ day: "2026-10-17", visits: 3, downloads: 2 });
    expect(s.days).toHaveLength(30);
  });
});

import { summarizeAccess, type AccessRow } from "../src/dashboard";

const a = (x: Partial<AccessRow>): AccessRow => ({ ts: NOW - 1000, kind: "trial", outcome: "new", reason: "", device: "0000aaaa", key: "", country: "IT", ...x });

describe("summarizeAccess", () => {
  it("counts Macs on trial, expired trials that came back, live licenses and refusals", () => {
    const s = summarizeAccess([
      a({ device: "m1", outcome: "new", ts: NOW - 3 * DAY }),
      a({ device: "m1", outcome: "active", ts: NOW - 1 * DAY }),
      a({ device: "m2", outcome: "expired", reason: "2d" }),
      a({ kind: "validate", outcome: "ok", key: "K1", device: "m3" }),
      a({ kind: "validate", outcome: "ok", key: "K1", device: "m3" }),
      a({ kind: "validate", outcome: "ok", key: "K2", device: "m4", ts: NOW - 5 * DAY }),
      a({ kind: "activate", outcome: "refused", reason: "invalid", key: "XX", device: "m5" }),
      a({ kind: "sale", outcome: "ok", reason: "7.99 EUR", device: "", key: "" }),
    ], NOW);
    expect(s.trialing).toBe(1);        // m1, its last word is "active"
    expect(s.expiredBack).toBe(1);     // m2
    expect(s.liveLicenses).toBe(1);    // K1 checked in the last 48h; K2 silent for 5 days
    expect(s.refused7d).toBe(1);
    expect(s.sales).toEqual(["7.99 EUR"]);
    expect(s.licenses.map((l) => l.key)).toEqual(["K1", "K2"]);
  });

  it("lists the latest events without the repetitive hourly checks", () => {
    const s = summarizeAccess([
      a({ kind: "validate", outcome: "ok", key: "K1", ts: NOW - 3 }),
      a({ kind: "validate", outcome: "ok", key: "K1", ts: NOW - 2 }),
      a({ kind: "activate", outcome: "ok", key: "K1", ts: NOW - 1 }),
    ], NOW);
    expect(s.recent.map((r) => r.kind)).toEqual(["activate"]);
  });
});

describe("handleDashboard with app accesses", () => {
  it("shows the access section from the access table", async () => {
    const calls: string[] = [];
    const db = {
      prepare: (sql: string) => ({ bind: () => ({ all: async () => { calls.push(sql); return { results: sql.includes("FROM access") ? [a({ kind: "activate", outcome: "refused", reason: "activation_limit", key: "ZZ99" })] : [] }; } }) }),
    } as unknown as D1Database;
    const res = await handleDashboard(get(basic("secret")), { DB: db, DASH_PASSWORD: "secret" }, NOW, noGithub);
    const html = await res.text();
    expect(calls.some((s) => s.includes("FROM access"))).toBe(true);
    expect(html).toContain("ZZ99");
    expect(html).toContain("activation_limit");
  });
});
