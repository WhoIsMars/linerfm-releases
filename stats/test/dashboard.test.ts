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
    expect(html).toContain("tiktok");
    expect(html).toContain("www.reddit.com");
  });

  it("escapes what it prints", async () => {
    const { db } = fakeDB([v("a", { src: "<script>" })]);
    const res = await handleDashboard(get(basic("secret")), { DB: db, DASH_PASSWORD: "secret" }, NOW, noGithub);
    const html = await res.text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
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
