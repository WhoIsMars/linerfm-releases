import { describe, it, expect } from "vitest";
import { summarizeUsers, activeByDay, githubReleases, cachedJson, maskEmail, readOrders } from "../src/admin";
import { handleDashboard } from "../src/dashboard";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 17, 16, 0, 0);
const S = Math.floor(NOW / 1000);
const H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64);
const acc = (x: Record<string, unknown>) => ({ ts: NOW - 1000, kind: "trial", outcome: "active", reason: "", device: "aaaaaaaa", key: "", country: "IT", ...x });

describe("summarizeUsers", () => {
  it("joins the trial ledger and the access log into one row per Mac", () => {
    const users = summarizeUsers(
      [{ hash: H1, started_at: S - 2 * 86400 }, { hash: H2, started_at: S - 9 * 86400 }, { hash: "testdevice123", started_at: S }],
      [
        acc({ device: "aaaaaaaa", ts: NOW - 3 * DAY }), acc({ device: "aaaaaaaa", ts: NOW - 1000 }),
        acc({ device: "bbbbbbbb", outcome: "expired", reason: "4d", ts: NOW - 2 * DAY, country: "DE" }),
        acc({ device: "cccccccc", kind: "validate", outcome: "ok", key: "6685", ts: NOW - 100, country: "AU" }),
      ],
      NOW,
    );
    expect(users.map((u) => u.device)).toEqual(["cccccccc", "aaaaaaaa", "bbbbbbbb"]); // most recent first, no test devices
    const [lic, trial, expired] = users;
    expect(lic).toMatchObject({ state: "license", key: "6685", country: "AU" });
    expect(trial).toMatchObject({ state: "trial", daysLeft: 3, activeDays: 2, country: "IT" });
    expect(expired).toMatchObject({ state: "expired", country: "DE" });
  });
});

describe("activeByDay", () => {
  it("counts distinct Macs per day, and new trials per day", () => {
    const d = activeByDay([
      acc({ device: "m1" }), acc({ device: "m1" }), acc({ device: "m2", kind: "validate", outcome: "ok" }),
      acc({ device: "m3", outcome: "new" }), acc({ device: "m9", outcome: "refused" }),
    ], NOW);
    expect(d).toHaveLength(30);
    expect(d[29]).toEqual({ day: "2026-10-17", active: 3, newTrials: 1 }); // refused requests are not users
  });
});

describe("githubReleases", () => {
  it("splits fresh installs, updates and update checks per release", () => {
    const r = githubReleases([{ tag_name: "v0.14.1", published_at: "2026-10-16T10:00:00Z", assets: [
      { name: "latest.json", download_count: 8 }, { name: "LinerFM_0.14.1_aarch64.dmg", download_count: 2 }, { name: "LinerFM_0.14.1_x64.dmg", download_count: 1 },
      { name: "LinerFM_aarch64.app.tar.gz", download_count: 4 }, { name: "LinerFM_x64.app.tar.gz", download_count: 0 },
    ] }]);
    expect(r).toEqual([{ tag: "v0.14.1", date: "2026-10-16", dmgArm: 2, dmgIntel: 1, win: 0, updates: 4, checks: 8 }]);
  });
});

describe("cachedJson", () => {
  function fakeDB() {
    const m = new Map<string, { ts: number; value: string }>();
    return {
      m,
      db: { prepare: (sql: string) => ({ bind: (...b: unknown[]) => ({
        first: async () => (sql.startsWith("SELECT") ? m.get(b[0] as string) ?? null : null),
        run: async () => { if (sql.startsWith("INSERT")) m.set(b[0] as string, { ts: b[1] as number, value: b[2] as string }); return {}; },
      }) }) } as unknown as D1Database,
    };
  }
  it("uses the fresh copy without calling out, refreshes a stale one, falls back to stale when the source fails", async () => {
    const f = fakeDB();
    let calls = 0;
    const ok = async () => { calls++; return [1]; };
    expect(await cachedJson(f.db, "gh", NOW, 30 * 60_000, ok)).toEqual([1]);
    expect(await cachedJson(f.db, "gh", NOW + 60_000, 30 * 60_000, ok)).toEqual([1]);
    expect(calls).toBe(1);
    const fail = async () => { throw new Error("rate limited"); };
    expect(await cachedJson(f.db, "gh", NOW + 3600_000, 30 * 60_000, fail)).toEqual([1]);
  });
});

describe("orders", () => {
  it("masks the email and keeps only what the owner needs", async () => {
    expect(maskEmail("mario.rossi@example.com")).toBe("m••••@example.com");
    const fetchImpl = (async () => Response.json({ data: [
      { attributes: { test_mode: false, status: "paid", refunded: false, total: 799, discount_total: 200, currency: "EUR", created_at: "2026-10-15T11:06:17Z", user_email: "a@b.it", user_name: "Ann", order_number: 7 } },
      { attributes: { test_mode: true, status: "paid", refunded: false, total: 999, discount_total: 0, currency: "EUR", created_at: "2026-10-14T11:06:17Z", user_email: "t@t.it", user_name: "T", order_number: 6 } },
    ], meta: { page: { lastPage: 1 } } })) as unknown as typeof fetch;
    const o = await readOrders(fetchImpl, "k", "1");
    expect(o).toEqual([{ ts: Date.parse("2026-10-15T11:06:17Z"), number: 7, cents: 799, discount: 200, currency: "EUR", email: "a••••@b.it", state: "pagato" }]);
  });
});

describe("admin tabs", () => {
  const db = { prepare: (sql: string) => ({
    bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }),
  }) } as unknown as D1Database;
  const kv = { list: async () => ({ keys: [{ name: H3 }], list_complete: true }), get: async () => JSON.stringify({ started_at: S - 86400 }) } as unknown as KVNamespace;
  const env = { DB: db, DASH_PASSWORD: "pw", TRIAL_LEDGER: kv };
  const req = (q: string) => new Request("https://s/dashboard" + q, { headers: { Authorization: "Basic " + btoa("x:pw") } });
  const noFetch = (async () => Response.json([])) as unknown as typeof fetch;

  it("every tab is behind the password", async () => {
    const res = await handleDashboard(new Request("https://s/dashboard?tab=utenti"), env, NOW, noFetch);
    expect(res.status).toBe(401);
  });

  it("shows the navigation and the users tab with the ledger Macs", async () => {
    const html = await (await handleDashboard(req("?tab=utenti"), env, NOW, noFetch)).text();
    for (const t of ["Panoramica", "Utenti", "Attività", "Download", "Vendite", "Sicurezza"]) expect(html).toContain(t);
    expect(html).toContain("cccccccc");
    expect(html).toContain('aria-current="page"');
  });

  it("an unknown tab falls back to the overview", async () => {
    const res = await handleDashboard(req("?tab=<x>"), env, NOW, noFetch);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("<x>");
  });
});
