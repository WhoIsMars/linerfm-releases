// Mac o Windows: la colonna access.os (migrations/0001_access_os.sql) divisa per piattaforma in dashboard.
import { describe, it, expect } from "vitest";
import { summarizeUsers, tabEvents } from "../src/admin";
import { handleDashboard, summarizeAccess, osSplit, type AccessRow } from "../src/dashboard";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 21, 10, 0, 0);
const S = Math.floor(NOW / 1000);
const a = (x: Partial<AccessRow>): AccessRow => ({ ts: NOW - 1000, kind: "trial", outcome: "new", reason: "", device: "aaaaaaaa", key: "", country: "IT", os: "", ...x });

// tre computer in prova: uno Mac, uno Windows, uno da un'app vecchia che non manda il sistema
const ROWS: AccessRow[] = [
  a({ device: "mmmmmmmm", os: "macos", ts: NOW - 2 * DAY }),
  a({ device: "mmmmmmmm", os: "", outcome: "active", ts: NOW - DAY }), // riga vecchia dopo una nuova: il sistema resta
  a({ device: "wwwwwwww", os: "windows" }),
  a({ device: "uuuuuuuu", os: "" }),
];

const ACCESS_SQL: string[] = [];
function fakeDb(rows: AccessRow[], opts: { noOsColumn?: boolean } = {}) {
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        all: async () => {
          if (sql.includes("FROM access")) {
            ACCESS_SQL.push(sql);
            if (opts.noOsColumn && /\bos\b/.test(sql)) throw new Error("D1_ERROR: no such column: os");
            return { results: opts.noOsColumn ? rows.map(({ os: _os, ...r }) => r) : rows };
          }
          return { results: [] };
        },
        first: async () => null, run: async () => ({}),
      }),
    }),
  } as unknown as D1Database;
}
const kv = { list: async () => ({ keys: [], list_complete: true }), get: async () => null } as unknown as KVNamespace;
const req = (q = "") => new Request("https://s/dashboard" + q, { headers: { Authorization: "Basic " + btoa("x:pw") } });
const noFetch = (async () => Response.json([])) as unknown as typeof fetch;
const page = async (q: string, db: D1Database) => (await handleDashboard(req(q), { DB: db, DASH_PASSWORD: "pw", TRIAL_LEDGER: kv }, NOW, noFetch)).text();

describe("osSplit", () => {
  it("names Mac and Windows always, the unknown ones only when there are any", () => {
    expect(osSplit(["macos", "windows", "macos"])).toBe("2 Mac, 1 Windows");
    expect(osSplit(["macos", "", ""])).toBe("1 Mac, 0 Windows, 2 non noti");
    expect(osSplit([""])).toBe("0 Mac, 0 Windows, 1 non noto");
  });
});

describe("summarizeUsers with the platform", () => {
  it("gives each computer the last known system, '' when no row ever said it", () => {
    const users = summarizeUsers([{ hash: "f".repeat(64), started_at: S - 3600 }], ROWS, NOW);
    const os = Object.fromEntries(users.map((u) => [u.device, u.os]));
    expect(os).toEqual({ mmmmmmmm: "macos", wwwwwwww: "windows", uuuuuuuu: "", ffffffff: "" });
  });
});

describe("summarizeAccess with the platform", () => {
  it("splits the computers on trial by system", () => {
    const x = summarizeAccess([...ROWS, a({ device: "eeeeeeee", os: "windows", outcome: "expired", reason: "1d" })], NOW);
    expect(x.trialing).toBe(3);
    expect([...x.trialingOs].sort()).toEqual(["", "macos", "windows"]);
    expect([...x.trialsOs].sort()).toEqual(["", "macos", "windows", "windows"]); // anche chi ha la prova finita
  });
});

describe("dashboard pages read access.os", () => {
  it("asks D1 for the os column", async () => {
    ACCESS_SQL.length = 0;
    await page("?tab=utenti", fakeDb(ROWS));
    expect(ACCESS_SQL.some((s) => /SELECT[^]*\bos\b[^]*FROM access/.test(s))).toBe(true);
  });

  it("the users tab splits computers by platform and shows each one's system", async () => {
    const html = await page("?tab=utenti", fakeDb(ROWS));
    expect(html).toContain("1 Mac, 1 Windows, 1 non noto");
    expect(html).toContain("<th>Sistema</th>");
    expect(html).toMatch(/wwwwwwww<\/td>(?:(?!<\/tr>).)*>Windows</);
    expect(html).not.toContain("il server non li distingue");
    expect(html).not.toContain("Mac e PC Windows insieme");
  });

  it("the overview splits the computers on trial and the funnel by platform", async () => {
    const html = await page("", fakeDb(ROWS));
    expect(html).toContain("1 Mac, 1 Windows, 1 non noto");
    expect(html).not.toContain("il server non li distingue");
    expect(html).not.toContain("Mac e PC Windows insieme");
  });

  it("the events tab splits the new trials of the week by platform", () => {
    const html = tabEvents([], ROWS, [], NOW);
    expect(html).toContain("1 Mac, 1 Windows, 1 non noto");
    expect(html).not.toContain("Mac e PC Windows insieme");
  });

  it("still works on a D1 without the os column yet: every computer is unknown", async () => {
    const html = await page("?tab=utenti", fakeDb(ROWS, { noOsColumn: true }));
    expect(html).toContain("0 Mac, 0 Windows, 3 non noti");
    expect(html).toContain("wwwwwwww");
  });
});
