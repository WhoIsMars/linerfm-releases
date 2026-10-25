import { describe, it, expect } from "vitest";
import { downloadEmbed, summaryEmbed, windowOf, handleScheduled } from "../src/notify";
import { handleHit } from "../src/hit";

const H = 3_600_000;
// 17/10/2026 18:00 UTC = 20:00 Roma: un tick del cron "0 */6 * * *"
const TICK = Date.UTC(2026, 9, 17, 18, 0, 0);
const ORIGIN = "https://whoismars.github.io";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";

describe("windowOf", () => {
  it("the window is the 6 hours before the cron tick, not before 'now'", () => {
    expect(windowOf(TICK + 42_000)).toEqual({ from: TICK - 6 * H, to: TICK });
  });
});

describe("downloadEmbed", () => {
  it("says which system, where from and where in the world, with the time in Discord format", () => {
    const e = downloadEmbed({ ts: TICK, arch: "apple-silicon", src: "", ref: "www.reddit.com", country: "IT" });
    expect(e.title).toBe("Download dal sito");
    const f = Object.fromEntries(e.fields.map((x) => [x.name, x.value]));
    expect(f["Sistema"]).toBe("Apple silicon");
    expect(f["Da dove"]).toBe("Reddit");
    expect(f["Paese"]).toContain("Italia");
    expect(f["Quando"]).toBe(`<t:${TICK / 1000}:F> (<t:${TICK / 1000}:R>)`);
  });
});

const row = (a: Record<string, unknown>) => ({ ts: TICK - H, kind: "view", ref: "", src: "", arch: "", sid: "s1", country: "IT", ...a });
const acc = (a: Record<string, unknown>) => ({ ts: TICK - H, kind: "validate", outcome: "ok", reason: "", device: "d1", key: "K", country: "IT", os: "", ...a });

describe("summaryEmbed", () => {
  const base = {
    win: { from: TICK - 6 * H, to: TICK },
    hits: [
      row({ sid: "a" }), row({ sid: "a" }), row({ sid: "b", ref: "www.reddit.com" }),
      row({ kind: "download", sid: "a", arch: "apple-silicon" }),
      row({ sid: "z", src: "claude" }),           // traffico di prova: non conta
      row({ sid: "old", ts: TICK - 7 * H }),      // fuori dalla finestra
    ],
    access: [
      acc({ kind: "trial", outcome: "new", device: "n1" }), acc({ device: "d1" }), acc({ device: "d1" }),
      acc({ kind: "trial", outcome: "active", device: "t1" }), acc({ outcome: "refused", device: "x" }),
    ],
    gh: { dmg: 40, updates: 12 }, ghPrev: { dmg: 37, updates: 10 },
    orders: [
      { ts: TICK - H, cents: 799, currency: "EUR", state: "pagato" as const },
      { ts: TICK - 2 * H, cents: 0, currency: "EUR", state: "regalato" as const },
      { ts: TICK - 30 * H, cents: 799, currency: "EUR", state: "pagato" as const },
    ],
  };
  const fields = (e: ReturnType<typeof summaryEmbed>) => Object.fromEntries(e.fields.map((x) => [x.name, x.value]));

  it("names the window in Rome time", () => {
    expect(summaryEmbed(base).title).toBe("Numeri 14:00 → 20:00");
  });

  it("counts visits and visitors without test traffic or rows outside the window", () => {
    const f = fields(summaryEmbed(base));
    expect(f["Visite sito"]).toBe("3 (2 persone)");
    expect(f["Persone che hanno scaricato"]).toBe("1");
    expect(f["Fonti"]).toContain("Reddit");
  });

  it("says how many visitors came from a phone or tablet, once the device is known", () => {
    const hits = [row({ sid: "a", client: "mobile" }), row({ sid: "a", client: "mobile" }), row({ sid: "b", client: "desktop" }), row({ sid: "c", client: "" })];
    expect(fields(summaryEmbed({ ...base, hits }))["Visite sito"]).toBe("4 (3 persone, 1 da telefono o tablet)");
  });

  // 25/10: quante persone aprono l'invito Discord dal sito, e da dove
  it("counts the people who open the Discord invite, by place", () => {
    const hits = [row({ sid: "a", kind: "discord", arch: "nav" }), row({ sid: "a", kind: "discord", arch: "nav" }),
      row({ sid: "b", kind: "discord", arch: "section" }), row({ sid: "c", kind: "discord", arch: "nav" })];
    expect(fields(summaryEmbed({ ...base, hits }))["Clic su Discord"]).toBe("3 (nav 2, section 1)");
    expect(fields(summaryEmbed(base))["Clic su Discord"]).toBe("0");
  });

  it("downloads from a phone are counted apart: a phone cannot install LinerFM", () => {
    const hits = [
      row({ sid: "a", kind: "download", client: "desktop" }),
      row({ sid: "b", kind: "download", client: "mobile" }), row({ sid: "b", kind: "download", client: "mobile" }),
      row({ sid: "c", kind: "download", client: "" }),
    ];
    expect(fields(summaryEmbed({ ...base, hits }))["Persone che hanno scaricato"]).toBe("2 (+1 da telefono, che non installa)");
  });

  it("GitHub downloads are the change since the previous summary", () => {
    const f = fields(summaryEmbed(base));
    expect(f["DMG scaricati"]).toBe("+3 (totale 40)");
    expect(f["Aggiornamenti"]).toBe("+2");
    expect(fields(summaryEmbed({ ...base, ghPrev: null }))["DMG scaricati"]).toBe("totale 40");
  });

  it("app usage: new trials and Macs that opened the app, refusals apart", () => {
    const f = fields(summaryEmbed(base));
    expect(f["Prove nuove"]).toBe("1 (0 Mac, 0 Windows, 1 non noto)");
    expect(f["Computer attivi"]).toBe("3 (0 Mac, 0 Windows, 3 non noti)");
    expect(f["Rifiuti"]).toBe("1");
  });

  it("splits new trials and active computers between Mac and Windows", () => {
    const f = fields(summaryEmbed({ ...base, access: [
      acc({ kind: "trial", outcome: "new", device: "m1", os: "macos" }),
      acc({ kind: "trial", outcome: "new", device: "w1", os: "windows" }),
      acc({ device: "w1", os: "" }),                 // riga senza sistema dello stesso PC: resta Windows
      acc({ device: "w2", os: "windows" }),
    ] }));
    expect(f["Prove nuove"]).toBe("2 (1 Mac, 1 Windows)");
    expect(f["Computer attivi"]).toBe("3 (1 Mac, 2 Windows)");
    expect(fields(summaryEmbed({ ...base, access: [] }))["Prove nuove"]).toBe("0");
  });

  it("emails left from a phone: how many in the window and from which social", () => {
    const leads = [{ ts: TICK - H, src: "tiktok" }, { ts: TICK - 2 * H, src: "tiktok" }, { ts: TICK - H, src: "" }, { ts: TICK - 7 * H, src: "x" }];
    expect(fields(summaryEmbed({ ...base, leads }))["Email da telefono"]).toBe("3 (TikTok 2, Diretto o sconosciuto 1)");
    expect(fields(summaryEmbed({ ...base, leads: [] }))["Email da telefono"]).toBe("0");
    expect(fields(summaryEmbed({ ...base, leads: null }))["Email da telefono"]).toBe("non leggibili");
  });

  it("sales in the window count only paid orders; a free order is not revenue", () => {
    const f = fields(summaryEmbed(base));
    expect(f["Vendite"]).toBe("1 (7,99 €)");
    expect(f["Totale vendite"]).toBe("2 (15,98 €)");
    expect(fields(summaryEmbed({ ...base, orders: null }))["Vendite"]).toBe("non leggibili");
  });
});

function fakeDB(opts: { prior?: number; lastHour?: number; snapshot?: string } = {}) {
  const runs: { sql: string; v: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => {
      const stmt = (v: unknown[]) => ({
        run: async () => { runs.push({ sql, v }); return {}; },
        first: async () => {
          if (/sid = \?/.test(sql)) return { n: opts.prior ?? 0 };
          if (/kind = 'download'/.test(sql)) return { n: opts.lastHour ?? 0 };
          if (/FROM cache/.test(sql)) return opts.snapshot ? { ts: 0, value: opts.snapshot } : null;
          return null;
        },
        all: async () => ({ results: [] }),
      });
      return { bind: (...v: unknown[]) => stmt(v), ...stmt([]) };
    },
  } as unknown as D1Database;
  return { db, runs };
}

const dl = (sid = "0123456789abcdef", s = "") =>
  new Request("https://stats.example/hit", { method: "POST", headers: { Origin: ORIGIN, "User-Agent": UA }, body: JSON.stringify({ k: "download", p: "/linerfm-releases/", r: "", s, a: "intel", i: sid }) });

function ctx() {
  const jobs: Promise<unknown>[] = [];
  return { c: { waitUntil: (p: Promise<unknown>) => void jobs.push(p), passThroughOnException() {} } as unknown as ExecutionContext, done: () => Promise.all(jobs) };
}

describe("download notifications from POST /hit", () => {
  const hook = (urls: string[]) => (async (u: string) => { urls.push(String(u)); return new Response(null, { status: 204 }); }) as typeof fetch;

  it("a DMG click goes to the downloads channel", async () => {
    const { db } = fakeDB(); const urls: string[] = []; const k = ctx();
    const res = await handleHit(dl(), { DB: db, DISCORD_DOWNLOADS_WEBHOOK: "https://d.example/dl" }, "IT", TICK, k.c, hook(urls));
    await k.done();
    expect(res.status).toBe(204);
    expect(urls).toEqual(["https://d.example/dl"]);
  });

  it("the same visitor clicking twice is announced once", async () => {
    const { db } = fakeDB({ prior: 1 }); const urls: string[] = []; const k = ctx();
    await handleHit(dl(), { DB: db, DISCORD_DOWNLOADS_WEBHOOK: "https://d.example/dl" }, "IT", TICK, k.c, hook(urls));
    await k.done();
    expect(urls).toEqual([]);
  });

  it("caps the channel at 20 an hour and skips test traffic", async () => {
    const urls: string[] = [];
    for (const [opts, s] of [[{ lastHour: 21 }, ""], [{}, "claude"]] as const) {
      const { db } = fakeDB(opts); const k = ctx();
      await handleHit(dl(undefined, s), { DB: db, DISCORD_DOWNLOADS_WEBHOOK: "https://d.example/dl" }, "IT", TICK, k.c, hook(urls));
      await k.done();
    }
    expect(urls).toEqual([]);
  });

  it("a page view is never announced, and a broken Discord never breaks the hit", async () => {
    const { db, runs } = fakeDB(); const k = ctx();
    const broken = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    const view = new Request("https://stats.example/hit", { method: "POST", headers: { Origin: ORIGIN, "User-Agent": UA }, body: JSON.stringify({ k: "view", p: "/x", r: "", s: "", a: "", i: "0123456789abcdef" }) });
    expect((await handleHit(view, { DB: db, DISCORD_DOWNLOADS_WEBHOOK: "https://d.example/dl" }, "IT", TICK, k.c, broken)).status).toBe(204);
    expect((await handleHit(dl(), { DB: db, DISCORD_DOWNLOADS_WEBHOOK: "https://d.example/dl" }, "IT", TICK, k.c, broken)).status).toBe(204);
    await expect(k.done()).resolves.toBeDefined();
    expect(runs.filter((r) => /INSERT INTO hits/.test(r.sql))).toHaveLength(2);
  });
});

describe("handleScheduled", () => {
  it("posts one summary to the metrics channel and saves the GitHub snapshot for the next delta", async () => {
    const { db, runs } = fakeDB({ snapshot: JSON.stringify({ dmg: 1, updates: 0 }) });
    const posts: { url: string; body: string }[] = [];
    const f = (async (u: string, init?: RequestInit) => {
      const url = String(u);
      if (url.includes("api.github.com")) return Response.json([{ tag_name: "v0.14.2", published_at: "", assets: [{ name: "LinerFM_0.14.2_aarch64.dmg", download_count: 4 }, { name: "LinerFM.app.tar.gz", download_count: 2 }] }]);
      posts.push({ url, body: String(init?.body) });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    await handleScheduled({ DB: db, DISCORD_METRICS_WEBHOOK: "https://d.example/metrics" }, TICK, f);
    expect(posts.map((p) => p.url)).toEqual(["https://d.example/metrics"]);
    const embed = JSON.parse(posts[0].body).embeds[0];
    expect(embed.fields.find((x: { name: string }) => x.name === "DMG scaricati").value).toBe("+3 (totale 4)");
    expect(embed.fields.find((x: { name: string }) => x.name === "Email da telefono").value).toBe("0");
    expect(runs.some((r) => /INSERT OR REPLACE INTO cache/.test(r.sql) && r.v[0] === "summary-gh")).toBe(true);
  });

  it("deletes emails older than 30 days on every tick, as the privacy page promises", async () => {
    const { db, runs } = fakeDB();
    await handleScheduled({ DB: db }, TICK, (async () => Response.json([])) as typeof fetch);
    const del = runs.find((r) => /DELETE FROM leads WHERE ts < \?/.test(r.sql));
    expect(del?.v).toEqual([TICK - 30 * 24 * H]);
  });

  it("does nothing without the webhook", async () => {
    const { db } = fakeDB(); const posts: string[] = [];
    await handleScheduled({ DB: db }, TICK, (async (u: string) => { posts.push(String(u)); return Response.json([]); }) as typeof fetch);
    expect(posts).toEqual([]);
  });
});

describe("handleScheduled reads access.os", () => {
  const run = async (noOsColumn: boolean) => {
    const sqls: string[] = []; const posted: string[] = [];
    const rows = [acc({ kind: "trial", outcome: "new", device: "w1", os: "windows" })];
    const db = { prepare: (sql: string) => ({ bind: () => ({
      all: async () => {
        if (!sql.includes("FROM access")) return { results: [] };
        sqls.push(sql);
        if (noOsColumn && /\bos\b/.test(sql)) throw new Error("D1_ERROR: no such column: os");
        return { results: noOsColumn ? rows.map(({ os: _os, ...r }) => r) : rows };
      },
      first: async () => null, run: async () => ({}),
    }) }) } as unknown as D1Database;
    const f = (async (u: string, init?: RequestInit) => { if (String(u).includes("hook")) posted.push(String(init?.body)); return Response.json([]); }) as unknown as typeof fetch;
    await handleScheduled({ DB: db, DISCORD_METRICS_WEBHOOK: "https://d.example/hook" } as never, TICK, f);
    return { sqls, body: posted.join("") };
  };

  it("asks D1 for the os column and puts the platform in the summary", async () => {
    const { sqls, body } = await run(false);
    expect(sqls.some((s) => /SELECT[^]*\bos\b[^]*FROM access/.test(s))).toBe(true);
    expect(body).toContain("1 (0 Mac, 1 Windows)");
  });

  it("without the os column it still counts, every computer unknown", async () => {
    const { body } = await run(true);
    expect(body).toContain("1 (0 Mac, 0 Windows, 1 non noto)");
  });
});
