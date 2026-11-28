// "Downloaded, not bought" (owner, 28/11/2026): la prova non esiste più dalla 1.7.2, la scheda Trials diventa chi apre
// l'app e non compra. Coorte: computer visti la prima volta negli ultimi 30 giorni, senza licenza, tranne le prove vere
// ancora in corso (riga sola "legacy") e il server Windows di prova.
import { describe, it, expect } from "vitest";
import { dashData, type Raw, type FirstRunRow } from "../src/dash-data";
import type { AccessRow } from "../src/dashboard";

const NOW = Date.UTC(2026, 10, 28, 12, 0, 0);
const H = 3_600_000, D = 24 * H;
const acc = (x: Partial<AccessRow>): AccessRow => ({ ts: NOW - D, kind: "trial", outcome: "new", reason: "no_trial", device: "aaaa0001", key: "", country: "IT", os: "macos", ...x });
const step = (device: string, s: string, ts: number, os = "macos"): FirstRunRow => ({ device, step: s, secs: 0, ts, os, country: "IT" });
const raw = (x: Partial<Raw>): Raw => ({ hits: [], access: [], devices: [], social: [], ledger: [], orders: [], gh: null, firstRun: [], ...x });

// a: Mac, aperto 2 giorni fa, ancora vivo ieri sera, risposto "too expensive"
// b: Windows, aperto 10 giorni fa e chiuso dopo 20 minuti, mai più
// c: Mac, aperto 5 giorni fa, poi comprato (licenza): non è nella coorte, è nella conversione
// d: prova vera ancora in corso (outcome active): solo nella riga legacy
// 8a995069: il server Windows di prova dell'owner, mai contato
const ACCESS: AccessRow[] = [
  acc({ device: "aaaa0001", ts: NOW - 2 * D }), acc({ device: "aaaa0001", outcome: "expired", ts: NOW - 20 * H }),
  acc({ device: "bbbb0002", os: "windows", ts: NOW - 10 * D }), acc({ device: "bbbb0002", os: "windows", outcome: "expired", ts: NOW - 10 * D + 20 * 60_000 }),
  acc({ device: "cccc0003", ts: NOW - 5 * D }), acc({ device: "cccc0003", kind: "activate", outcome: "ok", reason: "", key: "K1", ts: NOW - 4 * D }),
  acc({ device: "dddd0004", outcome: "active", reason: "", ts: NOW - 3 * H }),
  acc({ device: "8a995069", os: "windows", ts: NOW - D }),
];
const FIRST_RUN: FirstRunRow[] = [
  step("aaaa0001", "launch", NOW - 2 * D), step("aaaa0001", "track", NOW - 2 * D + 60_000), step("aaaa0001", "buy_click", NOW - 2 * D + 120_000),
  step("aaaa0001", "why_price", NOW - 2 * D + 130_000),
  step("bbbb0002", "launch", NOW - 10 * D, "windows"), step("bbbb0002", "quitwhy_try", NOW - 10 * D + 20 * 60_000, "windows"),
  step("cccc0003", "launch", NOW - 5 * D), step("cccc0003", "track", NOW - 5 * D + 1000),
  step("8a995069", "launch", NOW - D, "windows"),
];
const ORDERS = [{ ts: NOW - 4 * D, state: "pagato", cents: 1000, currency: "EUR", number: 1, discount: 0, email: "x" }] as unknown as Raw["orders"];

describe("notBought", () => {
  const nb = dashData(raw({ access: ACCESS, firstRun: FIRST_RUN, orders: ORDERS }), NOW).notBought;

  it("conta chi ha aperto senza comprare, per piattaforma, senza licenze, prove in corso e computer di prova", () => {
    expect(nb.total).toBe(2);
    expect(nb.os).toEqual({ macos: 1, windows: 1, unknown: 0 });
  });

  it("li mette per giorno del primo avvio, 30 giorni", () => {
    expect(nb.days).toHaveLength(30);
    expect(nb.days.at(-3)).toMatchObject({ macos: 1, windows: 0 });
    expect(nb.days.at(-11)).toMatchObject({ macos: 0, windows: 1 });
    expect(nb.days.reduce((n, d) => n + d.macos + d.windows + d.unknown, 0)).toBe(2);
  });

  it("i passi del primo avvio contano solo la coorte, sulla base di chi ha lanciato", () => {
    const by = Object.fromEntries(nb.steps.map((s) => [s.step, s.n]));
    expect(nb.base).toBe(2);
    expect(by.launch).toBe(2);
    expect(by.track).toBe(1);       // c ha suonato ma ha comprato: fuori
    expect(by.buy_click).toBe(1);
    expect(nb.stepsSince).toBe(NOW - 10 * D);
  });

  it("le risposte why_* e quitwhy_* come conteggi", () => {
    expect(nb.why).toEqual([{ step: "why_price", n: 1 }]);
    expect(nb.quitWhy).toEqual([{ step: "quitwhy_try", n: 1 }]);
  });

  it("quanto resta: chi si è visto negli ultimi 3 giorni è ancora attivo, gli altri per durata", () => {
    expect(nb.stopped.still).toBe(1);
    expect(nb.stopped.buckets).toEqual([{ k: "10m", n: 0 }, { k: "1h", n: 1 }, { k: "1d", n: 0 }, { k: "7d", n: 0 }, { k: "more", n: 0 }]);
  });

  it("conversione: computer nuovi aperti, di cui con licenza, e vendite in 30 giorni", () => {
    expect(nb.conversion).toMatchObject({ opened: 3, licensed: 1, sales: 1 });
  });

  it("le prove vere ancora in corso stanno in una riga sola", () => {
    expect(nb.legacy).toEqual({ n: 1, os: { macos: 1, windows: 0, unknown: 0 } });
  });

  it("senza first_run (tabella assente) la scheda resta, coi passi vuoti", () => {
    const n2 = dashData(raw({ access: ACCESS, orders: ORDERS }), NOW).notBought;
    expect(n2.total).toBe(2);
    expect(n2.base).toBe(0);
    expect(n2.stepsSince).toBeNull();
  });
});
