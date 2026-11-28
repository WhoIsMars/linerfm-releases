import { describe, it, expect, vi } from "vitest";
import worker from "../src/index";
import SCHEMA from "../schema.sql?raw";
import { sqliteD1, type SqliteD1 } from "./sqlite-d1";
import { romeStamp } from "../src/dash-online";

// Dashboard online (dal 28/11/2026): la pagina di casa dell'owner servita dal worker, stessa password e stesso link
// della vecchia /dashboard. I dati del Mac arrivano da review/push.py con DASH_SYNC_SECRET, i video stanno su R2.
const ORIGIN = "https://stats.example";
const SECRET = "s".repeat(40);
const AUTH = { Authorization: "Basic " + btoa("owner:pw") };
const SYNC = { Authorization: "Bearer " + SECRET };
const NOW = Date.parse("2026-11-28T15:00:00+01:00");

function fakeR2() {
  const m = new Map<string, Uint8Array>();
  const obj = (key: string, body: Uint8Array, range?: { offset: number; length: number }) => {
    const part = range ? body.slice(range.offset, range.offset + range.length) : body;
    return { key, size: body.length, range, httpEtag: '"e"', body: new Response(part).body, writeHttpMetadata: () => undefined };
  };
  const r2 = {
    get: async (k: string, o?: { range?: { offset: number; length: number } }) => (m.has(k) ? obj(k, m.get(k)!, o?.range) : null),
    head: async (k: string) => (m.has(k) ? obj(k, m.get(k)!) : null),
    put: async (k: string, v: ArrayBuffer | ReadableStream) => { m.set(k, new Uint8Array(v instanceof ArrayBuffer ? v : await new Response(v).arrayBuffer())); return {}; },
    delete: async (k: string) => { m.delete(k); },
    list: async () => ({ objects: [...m].map(([key, v]) => ({ key, size: v.length })), truncated: false }),
  } as unknown as R2Bucket;
  return { r2, m };
}

let db: SqliteD1;
async function setup(extra: Record<string, unknown> = {}) {
  db = await sqliteD1(SCHEMA);
  const media = fakeR2();
  const env = { DB: db.d1, DASH_PASSWORD: "pw", DASH_LINK_TOKEN: "t".repeat(40), DASH_SYNC_SECRET: SECRET, MEDIA: media.r2, ...extra };
  return { env, media };
}
type Env = Awaited<ReturnType<typeof setup>>["env"];
const call = (env: Env, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(ORIGIN + path, init), env as never, undefined as never);
const postJson = (env: Env, path: string, body: unknown, headers: Record<string, string> = AUTH) =>
  call(env, path, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", ...headers }, body: JSON.stringify(body) });

const SNAPSHOT = {
  ids: ["a-reel", "b-post", "c-old"],
  items: [
    { id: "a-reel", status: "pronto", date: "2026-11-28", time: "09:00", title: "A", texts: {}, video: "queue/a-reel/video.mp4", cover: null, variants: ["montaggio/a/reel-v1.mp4", "montaggio/a/reel-v2.mp4"], montaggio: "montaggio/a", judge: { verdict: null, scores: [] } },
    { id: "b-post", status: "da creare", date: "2026-12-01", time: "13:00", title: "B", texts: {}, video: null, cover: null, variants: [], judge: { verdict: null, scores: [] } },
    { id: "c-old", status: "saltato", date: "2026-11-01", time: "09:00", title: "C", texts: {}, video: null, cover: null, variants: [], judge: { verdict: null, scores: [] } },
  ],
  unlinked: [{ dir: "montaggio/new", variants: ["montaggio/new/reel-v1.mp4"], latest: "montaggio/new/reel-v1.mp4", mtime: NOW / 1000 }],
  published: [],
  decisions: [{ id: "fb", title: "Facebook Reels", options: ["on", "not now"] }],
  feedback: [
    { fid: "20261127-100000-aaaa", ts: "2026-11-27T10:00:00+01:00", kind: "review", item: "a-reel", file: null, vote: 3, scale: "1-5", good: "", bad: "", todo: "", test: false },
    { kind: "ack", ref: "20261127-100000-aaaa", by: "marketing", ts: "2026-11-27T11:00:00+01:00", note: "ok" },
  ],
  local: { overdue: 1, status: { pronto: 1 }, next: [], unread: 0, new_edits: 1, decisions_open: 1 },
  discord: 20,
};
const push = (env: Env) => call(env, "/dashboard/sync/snapshot", { method: "PUT", headers: { ...SYNC, "Content-Type": "application/json" }, body: JSON.stringify(SNAPSHOT) });

describe("dashboard online: un solo cancello per tutto", () => {
  const ROUTES: [string, string][] = [
    ["GET", "/dashboard"], ["GET", "/dashboard/api/items"], ["GET", "/dashboard/api/overview"], ["GET", "/dashboard/api/feedback"],
    ["GET", "/dashboard/api/decisions"], ["GET", "/dashboard/api/unlinked"], ["GET", "/dashboard/api/published"],
    ["POST", "/dashboard/api/feedback"], ["POST", "/dashboard/api/decision"], ["POST", "/dashboard/api/pick"],
    ["POST", "/dashboard/api/schedule"], ["POST", "/dashboard/api/discord"], ["GET", "/dashboard/f/queue/a-reel/video.mp4"],
    ["GET", "/dashboard/nope"], ["GET", "/dashboard/api/nope"],
  ];
  for (const [m, p] of ROUTES) {
    it(`${m} ${p} senza password risponde 401`, async () => {
      const { env } = await setup();
      const res = await call(env, p, { method: m, headers: m === "POST" ? { "Content-Type": "application/json" } : {}, body: m === "POST" ? "{}" : undefined });
      expect(res.status).toBe(401);
    });
  }
  it("la password sbagliata non entra, quella giusta sì", async () => {
    const { env } = await setup();
    expect((await call(env, "/dashboard/api/items", { headers: { Authorization: "Basic " + btoa("owner:no") } })).status).toBe(401);
    expect((await call(env, "/dashboard/api/items", { headers: AUTH })).status).toBe(200);
  });
  it("il cookie del link segreto apre anche le API e i video", async () => {
    const { env } = await setup();
    const r = await call(env, "/dashboard?k=" + "t".repeat(40), { redirect: "manual" });
    const cookie = (r.headers.get("Set-Cookie") ?? "").split(";")[0];
    expect((await call(env, "/dashboard/api/items", { headers: { Cookie: cookie } })).status).toBe(200);
  });
  for (const p of ["/dashboard/sync/snapshot", "/dashboard/sync/actions", "/dashboard/sync/media"]) {
    it(`${p} vuole il secret di sincronia: né niente né la password dell'owner bastano`, async () => {
      const { env } = await setup();
      expect((await call(env, p)).status).toBe(401);
      expect((await call(env, p, { headers: AUTH })).status).toBe(401);
      expect((await call(env, p, { headers: { Authorization: "Bearer " + "x".repeat(40) } })).status).toBe(401);
    });
  }
  it("senza DASH_SYNC_SECRET la sincronia è chiusa", async () => {
    const { env } = await setup({ DASH_SYNC_SECRET: undefined });
    expect((await call(env, "/dashboard/sync/actions", { headers: SYNC })).status).toBe(401);
  });
  it("la pagina è quella nuova, non indicizzabile e senza referrer", async () => {
    const { env } = await setup();
    const res = await call(env, "/dashboard", { headers: AUTH });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('const BASE = location.pathname.startsWith("/dashboard")');
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("le vecchie schede restano raggiungibili con ?tab=", async () => {
    const { env } = await setup();
    const res = await call(env, "/dashboard?tab=vendite", { headers: AUTH });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("const BASE");
  });
});

describe("dati del Mac", () => {
  it("la spinta arriva e le API rispondono come la pagina di casa", async () => {
    const { env } = await setup();
    expect((await push(env)).status).toBe(200);
    const items = await (await call(env, "/dashboard/api/items", { headers: AUTH })).json() as { id: string; overdue: boolean }[];
    expect(items.map((i) => i.id)).toEqual(["a-reel", "b-post"]);          // saltato fuori, in ritardo in cima
    expect(items[0].overdue).toBe(true);
    const all = await (await call(env, "/dashboard/api/items?status=" + encodeURIComponent("pronto,saltato"), { headers: AUTH })).json() as { id: string }[];
    expect(all.map((i) => i.id).sort()).toEqual(["a-reel", "c-old"]);
    expect(await (await call(env, "/dashboard/api/unlinked", { headers: AUTH })).json()).toEqual(SNAPSHOT.unlinked);
  });
  it("prima della prima spinta le API rispondono vuote, non 500", async () => {
    const { env } = await setup();
    expect(await (await call(env, "/dashboard/api/items", { headers: AUTH })).json()).toEqual([]);
    expect(await (await call(env, "/dashboard/api/feedback", { headers: AUTH })).json()).toEqual([]);
  });
  it("la spinta con un pezzo sconosciuto viene rifiutata", async () => {
    const { env } = await setup();
    const res = await call(env, "/dashboard/sync/snapshot", { method: "PUT", headers: { ...SYNC, "Content-Type": "application/json" }, body: JSON.stringify({ evil: 1 }) });
    expect(res.status).toBe(400);
  });
});

describe("voti e decisioni dal telefono", () => {
  it("un voto va in D1 nel formato di feedback.jsonl e compare subito nel log", async () => {
    const { env } = await setup(); await push(env);
    const res = await postJson(env, "/dashboard/api/feedback", { item: "a-reel", file: "montaggio/a/reel-v2.mp4", vote: 4, good: " bello ", bad: "", todo: "" });
    expect(res.status).toBe(200);
    const row = await res.json() as Record<string, unknown>;
    expect(row).toMatchObject({ kind: "review", item: "a-reel", file: "montaggio/a/reel-v2.mp4", vote: 4, scale: "1-5", good: "bello", bad: "", todo: "", test: false });
    expect(row.fid).toMatch(/^\d{8}-\d{6}-[0-9a-f]{4}$/);
    expect(row.ts).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+0[12]:00$/);
    const list = await (await call(env, "/dashboard/api/feedback", { headers: AUTH })).json() as { fid: string; acks: unknown[] }[];
    expect(list[0].fid).toBe(row.fid);                                       // il più recente in cima, come feedback_list
    expect(list.find((r) => r.fid === "20261127-100000-aaaa")?.acks).toHaveLength(1);
  });
  it("rifiuta voci, file e voti che la pagina di casa rifiuterebbe", async () => {
    const { env } = await setup(); await push(env);
    expect((await postJson(env, "/dashboard/api/feedback", { item: "nope", vote: 3 })).status).toBe(400);
    expect((await postJson(env, "/dashboard/api/feedback", { file: "../../etc/passwd", vote: 3 })).status).toBe(400);
    expect((await postJson(env, "/dashboard/api/feedback", { file: "montaggio/other/reel.mp4", vote: 3 })).status).toBe(400);
    expect((await postJson(env, "/dashboard/api/feedback", { item: "a-reel", vote: 9 })).status).toBe(400);
    expect((await postJson(env, "/dashboard/api/feedback", { item: "a-reel" })).status).toBe(400);
    expect(db.all("SELECT * FROM dash_actions")).toEqual([]);
  });
  it("solo JSON e solo dalla pagina stessa", async () => {
    const { env } = await setup(); await push(env);
    const form = await call(env, "/dashboard/api/feedback", { method: "POST", headers: { ...AUTH, "Content-Type": "text/plain", "Sec-Fetch-Site": "same-origin" }, body: '{"item":"a-reel","vote":3}' });
    expect(form.status).toBe(415);
    const cross = await postJson(env, "/dashboard/api/feedback", { item: "a-reel", vote: 3 }, { ...AUTH, "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" });
    expect(cross.status).toBe(403);
    expect(db.all("SELECT * FROM dash_actions")).toEqual([]);
  });
  it("una decisione segna decided e scende dal conto delle aperte", async () => {
    const { env } = await setup(); await push(env);
    expect((await postJson(env, "/dashboard/api/decision", { id: "fb", choice: "maybe" })).status).toBe(400);
    expect((await postJson(env, "/dashboard/api/decision", { id: "fb", choice: "on", note: "ok" })).status).toBe(200);
    const d = await (await call(env, "/dashboard/api/decisions", { headers: AUTH })).json() as { decided: { choice: string } | null }[];
    expect(d[0].decided?.choice).toBe("on");
    const ov = await (await call(env, "/dashboard/api/overview?lite=1", { headers: AUTH })).json() as { local: { decisions_open: number; unread: number } };
    expect(ov.local.decisions_open).toBe(0);
  });
  it("spostare date e mandare su Discord restano sulla pagina del Mac", async () => {
    const { env } = await setup(); await push(env);
    for (const p of ["/dashboard/api/schedule", "/dashboard/api/discord"]) expect((await postJson(env, p, { id: "a-reel" })).status).toBe(409);
  });
  it("sull'anteprima ogni scrittura è una prova (test: true)", async () => {
    const { env } = await setup({ DASH_TEST_WRITES: "1" }); await push(env);
    const row = await (await postJson(env, "/dashboard/api/feedback", { item: "a-reel", vote: 2 })).json() as { test: boolean };
    expect(row.test).toBe(true);
  });
  it("sull'anteprima una scelta di prova si vede come fatta: il badge scende, la scelta resta", async () => {
    const { env } = await setup({ DASH_TEST_WRITES: "1" }); await push(env);
    await postJson(env, "/dashboard/api/decision", { id: "fb", choice: "on" });
    const d = await (await call(env, "/dashboard/api/decisions", { headers: AUTH })).json() as { decided: { choice: string } | null }[];
    expect(d[0].decided?.choice).toBe("on");
    const ov = await (await call(env, "/dashboard/api/overview?lite=1", { headers: AUTH })).json() as { local: { decisions_open: number } };
    expect(ov.local.decisions_open).toBe(0);
  });
  it("sul worker vero una riga di prova arrivata dal Mac non conta, come in server.py", async () => {
    const { env } = await setup(); await push(env);
    const t = { fid: "20261128-100000-tttt", ts: "2026-11-28T10:00:00+01:00", kind: "decision", decision: "fb", choice: "on", note: "", test: true };
    await call(env, "/dashboard/sync/snapshot", { method: "PUT", headers: { ...SYNC, "Content-Type": "application/json" }, body: JSON.stringify({ feedback: [t] }) });
    const d = await (await call(env, "/dashboard/api/decisions", { headers: AUTH })).json() as { decided: unknown }[];
    expect(d[0].decided).toBe(null);
  });
  it("il Mac legge le righe nuove e le segna, senza riprenderle due volte", async () => {
    const { env } = await setup(); await push(env);
    const row = await (await postJson(env, "/dashboard/api/feedback", { item: "a-reel", vote: 5 })).json() as { fid: string };
    const got = await (await call(env, "/dashboard/sync/actions", { headers: SYNC })).json() as { fid: string; row: { vote: number } }[];
    expect(got.map((g) => g.fid)).toEqual([row.fid]);
    expect(got[0].row.vote).toBe(5);
    expect((await call(env, "/dashboard/sync/ack", { method: "POST", headers: { ...SYNC, "Content-Type": "application/json" }, body: JSON.stringify({ fids: [row.fid] }) })).status).toBe(200);
    expect(await (await call(env, "/dashboard/sync/actions", { headers: SYNC })).json()).toEqual([]);
  });
  it("una riga già arrivata in feedback.jsonl non compare due volte nel log", async () => {
    const { env } = await setup(); await push(env);
    const row = await (await postJson(env, "/dashboard/api/feedback", { item: "a-reel", vote: 5 })).json() as Record<string, unknown>;
    await call(env, "/dashboard/sync/snapshot", { method: "PUT", headers: { ...SYNC, "Content-Type": "application/json" }, body: JSON.stringify({ feedback: [...SNAPSHOT.feedback, row] }) });
    const list = await (await call(env, "/dashboard/api/feedback", { headers: AUTH })).json() as { fid: string }[];
    expect(list.filter((r) => r.fid === row.fid)).toHaveLength(1);
  });
});

describe("video su R2", () => {
  const bytes = new Uint8Array(1000).map((_, i) => i % 251);
  const put = (env: Env, key: string, body: Uint8Array) =>
    call(env, "/dashboard/sync/media/" + key, { method: "PUT", headers: { ...SYNC, "Content-Length": String(body.length) }, body });
  it("un video caricato si vede solo con la password, e a pezzi (206) come vuole Safari", async () => {
    const { env } = await setup();
    expect((await put(env, "montaggio/a/reel-v2.mp4", bytes)).status).toBe(200);
    expect((await call(env, "/dashboard/f/montaggio/a/reel-v2.mp4")).status).toBe(401);
    const full = await call(env, "/dashboard/f/montaggio/a/reel-v2.mp4", { headers: AUTH });
    expect(full.status).toBe(200);
    expect(full.headers.get("Content-Type")).toBe("video/mp4");
    expect(full.headers.get("Accept-Ranges")).toBe("bytes");
    const part = await call(env, "/dashboard/f/montaggio/a/reel-v2.mp4", { headers: { ...AUTH, Range: "bytes=100-199" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(bytes.slice(100, 200));
    const tail = await call(env, "/dashboard/f/montaggio/a/reel-v2.mp4", { headers: { ...AUTH, Range: "bytes=900-" } });
    expect(tail.headers.get("Content-Range")).toBe("bytes 900-999/1000");
    expect((await call(env, "/dashboard/f/montaggio/a/reel-v2.mp4", { headers: { ...AUTH, Range: "bytes=5000-" } })).status).toBe(416);
  });
  it("un file che non c'è dà 404, un percorso fuori da queue/ e montaggio/ pure", async () => {
    const { env } = await setup();
    expect((await call(env, "/dashboard/f/montaggio/x.mp4", { headers: AUTH })).status).toBe(404);
    expect((await put(env, "secrets/x.mp4", bytes)).status).toBe(400);
    expect((await put(env, "montaggio/../x.mp4", bytes)).status).toBe(400);
    expect((await put(env, "montaggio/a/notes.txt", bytes)).status).toBe(400);
  });
  it("il worker rifiuta un caricamento che porterebbe R2 oltre il tetto", async () => {
    const { env, media } = await setup({ DASH_MEDIA_CAP: "1500" });
    expect((await put(env, "montaggio/a/reel-v1.mp4", bytes)).status).toBe(200);
    expect((await put(env, "montaggio/a/reel-v2.mp4", bytes)).status).toBe(507);
    expect([...media.m.keys()]).toEqual(["montaggio/a/reel-v1.mp4"]);
    // rimpiazzare lo stesso file non conta due volte
    expect((await put(env, "montaggio/a/reel-v1.mp4", bytes)).status).toBe(200);
  });
  it("il Mac vede l'elenco e cancella", async () => {
    const { env, media } = await setup();
    await put(env, "queue/a-reel/video.mp4", bytes);
    expect(await (await call(env, "/dashboard/sync/media", { headers: SYNC })).json()).toEqual([{ key: "queue/a-reel/video.mp4", size: 1000 }]);
    expect((await call(env, "/dashboard/sync/media/queue/a-reel/video.mp4", { method: "DELETE", headers: SYNC })).status).toBe(200);
    expect(media.m.size).toBe(0);
  });
  it("senza R2 la pagina funziona e i video danno 404", async () => {
    const { env } = await setup({ MEDIA: undefined });
    expect((await call(env, "/dashboard/f/montaggio/a/reel-v2.mp4", { headers: AUTH })).status).toBe(404);
  });
});

describe("ora di Roma", () => {
  it("fid e ts come _append di server.py, con l'offset giusto d'inverno e d'estate", () => {
    expect(romeStamp(Date.parse("2026-11-28T14:05:09Z"), "abcd")).toEqual({ fid: "20261128-150509-abcd", ts: "2026-11-28T15:05:09+01:00" });
    expect(romeStamp(Date.parse("2026-07-01T22:30:00Z"), "0000")).toEqual({ fid: "20260702-003000-0000", ts: "2026-07-02T00:30:00+02:00" });
  });
});

describe("numeri", () => {
  it("overview risponde con i numeri calcolati nel worker, nella forma della pagina di casa", async () => {
    vi.stubGlobal("fetch", async () => Response.json([]));             // GitHub e Lemon Squeezy: niente rete nei test
    const { env } = await setup(); await push(env);
    const ov = await (await call(env, "/dashboard/api/overview", { headers: AUTH })).json() as { local: { overdue: number }; numbers: { data: { discord: number; dash: { users: { total: number } } }; loading: boolean } };
    expect(ov.local.overdue).toBe(1);
    expect(ov.numbers.loading).toBe(false);
    expect(ov.numbers.data.discord).toBe(20);
    expect(ov.numbers.data.dash.users.total).toBe(0);
    vi.unstubAllGlobals();
  });
});
void NOW;
