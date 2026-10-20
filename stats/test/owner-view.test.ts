// La pagina admin letta dall'owner: persone e non clic, da dove viene ogni numero, Eventi, Social.
import { describe, it, expect } from "vitest";
import { summarize, handleDashboard, archName, clicksText, type Row } from "../src/dashboard";
import { githubReleases, tabEvents, tabSocial, latestSocial, type SocialRow } from "../src/admin";
import { downloadEmbed } from "../src/notify";

const NOW = Date.UTC(2026, 9, 20, 10, 0, 0);
const MIN = 60_000;
const hit = (x: Partial<Row>): Row => ({ ts: NOW - 60 * MIN, kind: "view", ref: "", src: "", arch: "", sid: "s1", country: "IT", ...x });

// I download reali dal 15 al 20/10: 7 clic da 4 schede, una dal Bhutan con 4 clic in un minuto.
const REAL: Row[] = [
  hit({ sid: "au", kind: "view", src: "youtube", country: "AU", ts: NOW - 5 * 86_400_000 }),
  hit({ sid: "au", kind: "download", src: "youtube", arch: "apple-silicon", country: "AU", ts: NOW - 5 * 86_400_000 + MIN }),
  hit({ sid: "id", kind: "download", arch: "intel", country: "ID", ts: NOW - 4 * 86_400_000 }),
  hit({ sid: "bt", kind: "view", src: "ig", country: "BT", ts: NOW - 14 * 3_600_000 }),
  hit({ sid: "bt", kind: "download", src: "ig", arch: "intel", country: "BT", ts: NOW - 14 * 3_600_000 + 10_000 }),
  hit({ sid: "bt", kind: "download", src: "ig", arch: "windows", country: "BT", ts: NOW - 14 * 3_600_000 + 30_000 }),
  hit({ sid: "bt", kind: "download", src: "ig", arch: "apple-silicon", country: "BT", ts: NOW - 14 * 3_600_000 + 50_000 }),
  hit({ sid: "bt", kind: "download", src: "ig", arch: "intel", country: "BT", ts: NOW - 14 * 3_600_000 + 70_000 }),
  hit({ sid: "tt", kind: "download", arch: "windows", country: "TT", ts: NOW - 7 * 3_600_000 }),
];

function fakeDb(t: { hits?: Row[]; access?: unknown[]; social?: SocialRow[] }) {
  const pick = (sql: string) => (sql.includes("FROM access") ? t.access ?? [] : sql.includes("FROM social") ? t.social ?? [] : sql.includes("FROM hits") ? t.hits ?? [] : []);
  return { prepare: (sql: string) => ({ bind: () => ({ all: async () => ({ results: pick(sql) }), first: async () => null, run: async () => ({}) }) }) } as unknown as D1Database;
}
const req = (q = "") => new Request("https://s/dashboard" + q, { headers: { Authorization: "Basic " + btoa("x:pw") } });
const ls = (orders: unknown[]) => (async (url: string) => (String(url).includes("lemonsqueezy") ? Response.json({ data: orders, meta: { page: { lastPage: 1 } } }) : Response.json([]))) as unknown as typeof fetch;
const order = { attributes: { test_mode: false, status: "paid", refunded: false, currency: "EUR", total: 1099, discount_total: 0, order_number: 1, user_email: "a@b.it", created_at: new Date(NOW - 3 * 3_600_000).toISOString() } };

describe("persone, non clic", () => {
  it("7 clic sui pulsanti sono 4 persone", () => {
    const s = summarize(REAL, NOW);
    expect(s.downloads).toBe(7);
    expect(s.downloaders).toBe(4);
  });

  it("i download per giorno contano le persone", () => {
    const s = summarize(REAL, NOW);
    expect(s.days.find((d) => d.day === "2026-10-19")!.downloads).toBe(1); // il Bhutan, 4 clic
  });

  it("la lista dei download ha una riga per persona con i suoi clic", () => {
    const s = summarize(REAL, NOW);
    const bt = s.people.find((p) => p.country === "BT")!;
    expect(bt.clicks).toBe(4);
    expect(bt.arches).toEqual(["intel", "windows", "apple-silicon"]);
    expect(s.people).toHaveLength(4);
    expect(s.people[0].country).toBe("TT"); // la più recente in alto
  });

  it("la durata dei clic conta solo i clic, non le pagine viste dopo", () => {
    const later = [...REAL, hit({ sid: "bt", kind: "view", src: "ig", country: "BT", ts: NOW - 14 * 3_600_000 + 5 * MIN })];
    expect(clicksText(summarize(later, NOW).people.find((p) => p.country === "BT")!)).toBe("4 clic in 1 min");
  });

  it("la Panoramica mostra le persone accanto ai clic", async () => {
    const html = await (await handleDashboard(req(), { DB: fakeDb({ hits: REAL }), DASH_PASSWORD: "pw" }, NOW, ls([]))).text();
    expect(html).toContain("Persone che hanno scaricato");
    expect(html).toContain("7 clic sui pulsanti");
  });

  it("la scheda Download mostra le persone accanto ai clic", async () => {
    const html = await (await handleDashboard(req("?tab=download"), { DB: fakeDb({ hits: REAL }), DASH_PASSWORD: "pw" }, NOW, ls([]))).text();
    expect(html).toContain("Persone che hanno scaricato");
    expect(html).toContain("4 clic in 1 min");
  });
});

describe("Windows", () => {
  it("il pulsante Windows ha il suo nome, sulla pagina e su Discord", () => {
    expect(archName("windows")).toBe("Windows");
    const e = downloadEmbed({ ts: NOW, arch: "windows", src: "", ref: "", country: "TT" });
    expect(e.fields[0]).toMatchObject({ name: "Sistema", value: "Windows" });
  });

  it("l'installer Windows di GitHub si conta", () => {
    const [r] = githubReleases([{ tag_name: "v1.0.0", published_at: "2026-10-19T16:17:34Z", assets: [
      { name: "latest.json", download_count: 19 }, { name: "LinerFM_1.0.0_aarch64.dmg", download_count: 2 },
      { name: "LinerFM_1.0.0_x64-setup.exe", download_count: 5 }, { name: "LinerFM_1.0.0_x64.dmg", download_count: 2 },
    ] }]);
    expect(r.win).toBe(5);
  });
});

describe("una riga sotto ogni numero dice da dove viene", () => {
  it("Panoramica", async () => {
    const html = await (await handleDashboard(req(), { DB: fakeDb({ hits: REAL }), DASH_PASSWORD: "pw", LS_API_KEY: "k" }, NOW, ls([order]))).text();
    expect(html).toContain("ordini veri su Lemon Squeezy");
    expect(html).toContain("una visita = una scheda del browser");
    expect(html).toContain("Mac e PC Windows insieme");
    expect(html).toContain("registro accessi del server licenze");
  });

  it("Download: GitHub conta anche te e i test, gli aggiornamenti vengono da app già installate", async () => {
    const html = await (await handleDashboard(req("?tab=download"), { DB: fakeDb({ hits: REAL }), DASH_PASSWORD: "pw" }, NOW, ls([]))).text();
    expect(html).toContain("anche i tuoi download e quelli di prova");
    expect(html).toContain("app già installate");
    expect(html).toContain("Installer Windows");
  });

  it("Utenti: il registro prove viene dal KV e non distingue Mac e Windows", async () => {
    const html = await (await handleDashboard(req("?tab=utenti"), { DB: fakeDb({}), DASH_PASSWORD: "pw" }, NOW, ls([]))).text();
    expect(html).toContain("TRIAL_LEDGER");
    expect(html).toContain("Mac e PC Windows insieme");
  });

  it("nessun trattino lungo nella pagina", async () => {
    for (const q of ["", "?tab=download", "?tab=eventi", "?tab=social", "?tab=utenti"]) {
      const html = await (await handleDashboard(req(q), { DB: fakeDb({ hits: REAL }), DASH_PASSWORD: "pw" }, NOW, ls([order]))).text();
      expect(html).not.toContain("—");
    }
  });
});

describe("scheda Eventi", () => {
  const access = [
    { ts: NOW - 6 * 3_600_000, kind: "trial", outcome: "new", reason: "", device: "abcd1234", key: "", country: "TT" },
    { ts: NOW - 5 * 3_600_000, kind: "validate", outcome: "ok", reason: "", device: "abcd1234", key: "6685", country: "TT" },
  ];

  it("visite, download, prove nuove e vendite in ordine di tempo, ora di Roma", () => {
    const html = tabEvents(summarize(REAL, NOW).sessions, access, [{ ts: NOW - 3 * 3_600_000, number: 1, cents: 1099, discount: 0, currency: "EUR", email: "a••••@b.it", state: "pagato" }], NOW);
    const order = ["Vendita", "Nuova prova gratuita", "Download", "Bhutan"].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("4 clic");
    expect(html).toContain("19/10, 22:00"); // 20:00 UTC del 19/10
    expect(html).not.toContain("Controllo licenza"); // i controlli orari riusciti sono rumore
  });

  it("la scheda è nella navigazione", async () => {
    const res = await handleDashboard(req("?tab=eventi"), { DB: fakeDb({ hits: REAL, access }), DASH_PASSWORD: "pw" }, NOW, ls([]));
    const html = await res.text();
    expect(html).toContain('href="/dashboard?tab=eventi" aria-current="page"');
    expect(html).toContain("Nuova prova gratuita");
  });
});

describe("scheda Social", () => {
  const S: SocialRow[] = [
    { ts: NOW - 2 * 86_400_000, platform: "instagram", item: "r1", title: "Reel uno", views: 100, likes: 3, comments: 0 },
    { ts: NOW - 86_400_000, platform: "instagram", item: "r1", title: "Reel uno", views: 150, likes: 5, comments: 1 },
    { ts: NOW - 86_400_000, platform: "tiktok", item: "t9", title: "Video tiktok", views: 40, likes: 2, comments: 0 },
    { ts: NOW - 86_400_000, platform: "youtube-shorts", item: "r1", title: "Reel uno", views: 7, likes: 0, comments: 0 },
  ];

  it("tiene l'ultima lettura per reel e piattaforma, con la differenza dalla precedente", () => {
    const l = latestSocial(S);
    expect(l).toHaveLength(3);
    expect(l.find((r) => r.platform === "instagram")).toMatchObject({ views: 150, change: 50 });
    expect(l.find((r) => r.platform === "tiktok")).toMatchObject({ views: 40, change: null });
  });

  it("mostra i totali per piattaforma e i reel", async () => {
    const html = tabSocial(S, NOW);
    expect(html).toContain("Instagram");
    expect(html).toContain("TikTok");
    expect(html).toContain("YouTube Shorts");
    expect(html).toContain("Reel uno");
    expect(html).toContain("+50");
    expect(html).toContain("197"); // 150 + 40 + 7
  });

  it("senza letture dice da dove arriveranno", async () => {
    const html = await (await handleDashboard(req("?tab=social"), { DB: fakeDb({}), DASH_PASSWORD: "pw" }, NOW, ls([]))).text();
    expect(html).toContain("metrics.mjs");
  });
});
