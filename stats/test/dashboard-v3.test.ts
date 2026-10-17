import { describe, it, expect } from "vitest";
import { handleDashboard, prettySource, readSales } from "../src/dashboard";

const NOW = Date.UTC(2026, 9, 17, 16, 0, 0);
const basic = (pw: string) => ({ Authorization: "Basic " + btoa("owner:" + pw) });
const get = () => new Request("https://stats.example/dashboard", { headers: basic("secret") });

function db(hits: unknown[], access: unknown[]) {
  return { prepare: (sql: string) => ({ bind: () => ({ all: async () => ({ results: sql.includes("FROM access") ? access : hits }) }) }) } as unknown as D1Database;
}

const lsOrders = (orders: unknown[]) => (async (url: string) => {
  if (String(url).includes("lemonsqueezy")) return Response.json({ data: orders, meta: { page: { lastPage: 1 } } });
  return Response.json([]);
}) as unknown as typeof fetch;

const order = (a: Record<string, unknown>) => ({ attributes: { test_mode: false, status: "paid", refunded: false, currency: "EUR", total: 1099, created_at: "2026-10-15T11:06:17.000000Z", ...a } });

describe("prettySource", () => {
  it("turns hosts and tags into names a person reads", () => {
    expect(prettySource("youtube")).toBe("YouTube");
    expect(prettySource("www.youtube.com")).toBe("YouTube");
    expect(prettySource("www.bing.com")).toBe("Bing");
    expect(prettySource("diretto")).toBe("Diretto o sconosciuto");
    expect(prettySource("news.ycombinator.com")).toBe("Hacker News");
    expect(prettySource("example.org")).toBe("example.org");
  });
});

describe("readSales", () => {
  it("counts only real paid orders above zero and sums the money", async () => {
    const s = await readSales(lsOrders([order({}), order({ total: 0 }), order({ test_mode: true }), order({ refunded: true })]), "k", "1");
    expect(s).toEqual({ paid: 1, cents: 1099, currency: "EUR", last: "2026-10-15T11:06:17.000000Z", refunded: 1, times: [Date.parse("2026-10-15T11:06:17.000000Z")] });
  });
  it("returns null without a key or when Lemon Squeezy fails", async () => {
    expect(await readSales(lsOrders([]), undefined, "1")).toBeNull();
    expect(await readSales((async () => new Response("no", { status: 500 })) as unknown as typeof fetch, "k", "1")).toBeNull();
  });
});

describe("dashboard page", () => {
  const hits = [
    { ts: NOW - 1000, kind: "view", ref: "www.youtube.com", src: "youtube", arch: "", sid: "a", country: "AU" },
    { ts: NOW - 900, kind: "download", ref: "", src: "youtube", arch: "apple-silicon", sid: "a", country: "AU" },
    { ts: NOW - 800, kind: "view", ref: "", src: "verifica", arch: "", sid: "b", country: "IT" },
  ];

  it("shows the funnel with the real sales from Lemon Squeezy", async () => {
    const res = await handleDashboard(get(), { DB: db(hits, []), DASH_PASSWORD: "secret", LS_API_KEY: "k" }, NOW, lsOrders([order({})]));
    const html = await res.text();
    expect(html).toContain("Percorso");
    expect(html).toContain("10,99");
    expect(html).toContain("YouTube");
    expect(html).toContain("Apple Silicon");
  });

  it("hides the owner's own test traffic", async () => {
    const html = await (await handleDashboard(get(), { DB: db(hits, []), DASH_PASSWORD: "secret" }, NOW, lsOrders([]))).text();
    expect(html).not.toContain("verifica");
  });

  it("says plainly when nothing happened instead of showing empty tables", async () => {
    const html = await (await handleDashboard(get(), { DB: db([], []), DASH_PASSWORD: "secret" }, NOW, lsOrders([]))).text();
    expect(html).toContain("Nessun accesso registrato");
    expect(html).not.toContain("<th>");
  });

  it("writes every time in Rome time", async () => {
    const html = await (await handleDashboard(get(), { DB: db(hits, []), DASH_PASSWORD: "secret" }, NOW, lsOrders([]))).text();
    expect(html).toContain("17/10, 17:59"); // 15:59 UTC
    expect(html).not.toMatch(/2026-10-17 15:59/);
  });
});
