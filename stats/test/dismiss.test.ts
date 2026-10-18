import { describe, it, expect } from "vitest";
import { handleDashboard } from "../src/dashboard";
import { tabSecurity } from "../src/admin";

const NOW = Date.UTC(2026, 9, 18, 8, 0, 0);
const AUTH = { Authorization: "Basic " + btoa("x:pw") };
const ORIGIN = "https://stats.example";
const noFetch = (async () => Response.json([])) as unknown as typeof fetch;
const refused = (id: number, reason: string) => ({ id, ts: NOW - 3_600_000, kind: "trial", outcome: "refused", reason, device: "verifica", key: "", country: "IT" });

function fakeDB() {
  const runs: { sql: string; v: unknown[] }[] = [];
  const reads: string[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...v: unknown[]) => ({
        run: async () => { runs.push({ sql, v }); return {}; },
        all: async () => { reads.push(sql); return { results: [] }; },
      }),
    }),
  } as unknown as D1Database;
  return { db, runs, reads };
}

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request(ORIGIN + "/dashboard", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, ...AUTH, ...headers }, body });

describe("dismissing a security alert", () => {
  it("each refused attempt has a Togli button that posts its id", () => {
    const html = tabSecurity([refused(6, "bad_device")], NOW);
    expect(html).toMatch(/<form method="post" action="\/dashboard\?tab=sicurezza"[^>]*>[\s\S]*name="dismiss" value="6"[\s\S]*Togli/);
  });

  it("POST stores the dismissal and sends the owner back to the security tab", async () => {
    const { db, runs } = fakeDB();
    const res = await handleDashboard(post("dismiss=6"), { DB: db, DASH_PASSWORD: "pw" }, NOW, noFetch);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/dashboard?tab=sicurezza");
    expect(runs.some((r) => /INSERT OR IGNORE INTO dismissed/.test(r.sql) && r.v[0] === 6)).toBe(true);
  });

  it("dismissed rows are left out of every tab", async () => {
    const { db, reads } = fakeDB();
    await handleDashboard(new Request(ORIGIN + "/dashboard?tab=sicurezza", { headers: AUTH }), { DB: db, DASH_PASSWORD: "pw" }, NOW, noFetch);
    expect(reads.find((s) => s.includes("FROM access"))).toMatch(/rowid NOT IN \(SELECT id FROM dismissed\)/);
  });

  it("works from the real page: no-referrer makes the browser send Origin: null, Sec-Fetch-Site says same-origin", async () => {
    const { db, runs } = fakeDB();
    const res = await handleDashboard(post("dismiss=6", { Origin: "null", "Sec-Fetch-Site": "same-origin" }), { DB: db, DASH_PASSWORD: "pw" }, NOW, noFetch);
    expect(res.status).toBe(303);
    expect(runs).toHaveLength(1);
  });

  it("Origin: null from another site is still refused", async () => {
    const { db, runs } = fakeDB();
    const res = await handleDashboard(post("dismiss=6", { Origin: "null", "Sec-Fetch-Site": "cross-site" }), { DB: db, DASH_PASSWORD: "pw" }, NOW, noFetch);
    expect(res.status).toBe(403);
    expect(runs).toEqual([]);
  });

  it("refuses without the password, from another site, or with a bad id", async () => {
    const env = () => { const f = fakeDB(); return { f, env: { DB: f.db, DASH_PASSWORD: "pw" } }; };
    const a = env(); expect((await handleDashboard(post("dismiss=6", { Authorization: "" }), a.env, NOW, noFetch)).status).toBe(401);
    const b = env(); expect((await handleDashboard(post("dismiss=6", { Origin: "https://evil.example" }), b.env, NOW, noFetch)).status).toBe(403);
    const c = env(); expect((await handleDashboard(post("dismiss=abc"), c.env, NOW, noFetch)).status).toBe(400);
    for (const x of [a, b, c]) expect(x.f.runs).toEqual([]);
  });
});
