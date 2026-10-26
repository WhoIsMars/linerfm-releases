import { describe, it, expect } from "vitest";
import { summarizeUsers, tabUsers, readDevices, type DeviceRow } from "../src/admin";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const S = Math.floor(NOW / 1000);
const acc = (x: Record<string, unknown>) => ({ ts: NOW - 1000, kind: "trial", outcome: "active", reason: "", device: "aaaaaaaa", key: "", country: "IT", os: "macos", ...x });
const dev = (x: Partial<DeviceRow>): DeviceRow => ({
  device: "aaaaaaaa", first_ts: NOW - 2 * DAY, last_ts: NOW - 1000, checks: 30, state: "trial:active", trial_day: 3, key: "", country: "IT",
  os: "macos", os_version: "26.1", arch: "aarch64", locale: "it-IT", app_version: "1.2.8", players: "apple-music,spotify", launches: 14,
  app_first_seen: NOW - 2 * DAY, discord_id: "", discord_name: "", ...x,
});

// node:sqlite senza import (vite non lo conosce, il progetto non ha i tipi di Node)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- moduli di Node senza tipi qui
const node = (m: string): any => (globalThis as any).process.getBuiltinModule(m);

describe("summarizeUsers with the devices table", () => {
  it("each computer carries what its card says: Discord, app, system, players, launches, trial day", () => {
    const [u] = summarizeUsers([{ hash: "a".repeat(64), started_at: S - 2 * 86400 }], [acc({})], NOW, [dev({ discord_name: "@mario", discord_id: "42" })]);
    expect(u).toMatchObject({
      device: "aaaaaaaa", discordName: "@mario", appVersion: "1.2.8", osVersion: "26.1", arch: "aarch64", locale: "it-IT",
      players: "apple-music,spotify", launches: 14, checks: 30, trialDay: 3, state: "trial",
    });
  });

  it("a computer seen only in devices (access rows older than 30 days) is still listed", () => {
    const users = summarizeUsers([], [], NOW, [dev({ device: "dddddddd", state: "validate:ok", key: "6685", first_ts: NOW - 40 * DAY, last_ts: NOW - DAY, country: "US" })]);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ device: "dddddddd", state: "license", key: "6685", country: "US", firstSeen: NOW - 40 * DAY, lastSeen: NOW - DAY });
  });

  it("without the devices table the rows are the same as before", () => {
    const users = summarizeUsers([{ hash: "a".repeat(64), started_at: S - 86400 }], [acc({})], NOW);
    expect(users[0]).toMatchObject({ device: "aaaaaaaa", discordName: "", launches: 0, players: "" });
  });
});

describe("tabUsers reads as people", () => {
  it("the first column is the Discord name when linked, else country and system", () => {
    const html = tabUsers(summarizeUsers([], [], NOW, [
      dev({ device: "aaaaaaaa", discord_name: "Mario <b>(@mario)</b>" }),
      dev({ device: "bbbbbbbb", country: "DE", os: "windows", os_version: "11 24H2 (26100)", arch: "x86_64" }),
    ]), NOW);
    expect(html).toContain("Mario &lt;b&gt;(@mario)&lt;/b&gt;");
    expect(html).not.toContain("<b>(@mario)</b>");
    expect(html).toMatch(/Germania · Windows/);
    expect(html).toContain("Windows 11 24H2 (26100) · x64");
    expect(html).toContain("macOS 26.1 · Apple Silicon");
    expect(html).toContain("Apple Music, Spotify");
    expect(html).toContain("giorno 3 di 5");
    expect(html).toContain("1.2.8");
    for (const th of ["Persona", "Computer", "Sistema", "App", "Player", "Avvii", "Lingua"]) expect(html).toContain(`<th>${th}</th>`);
  });
});

describe("readDevices", () => {
  it("reads the table created by migration 0005", async () => {
    const { DatabaseSync } = node("node:sqlite");
    const fs = node("node:fs");
    const s = new DatabaseSync(":memory:");
    s.exec(fs.readFileSync(new URL("../migrations/0005_devices.sql", import.meta.url), "utf8"));
    s.prepare("INSERT INTO devices (device, first_ts, last_ts, players) VALUES (?, ?, ?, ?)").run("aaaaaaaa", 1, 2, "spotify");
    const db = { prepare: (sql: string) => ({ all: async () => ({ results: s.prepare(sql).all() }) }) } as unknown as D1Database;
    expect(await readDevices(db)).toMatchObject([{ device: "aaaaaaaa", players: "spotify", launches: 0, discord_name: "" }]);
  });

  it("before the migration it gives an empty list instead of breaking the page", async () => {
    const db = { prepare: () => ({ all: async () => { throw new Error("no such table: devices"); } }) } as unknown as D1Database;
    expect(await readDevices(db)).toEqual([]);
  });
});
