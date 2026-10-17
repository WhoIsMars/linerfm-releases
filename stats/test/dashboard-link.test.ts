import { describe, it, expect } from "vitest";
import { handleDashboard } from "../src/dashboard";

const NOW = Date.UTC(2026, 9, 17, 16, 0, 0);
const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) } as unknown as D1Database;
const noFetch = (async () => Response.json([])) as unknown as typeof fetch;
const ENV = { DB: db, DASH_PASSWORD: "pw", DASH_LINK_TOKEN: "t".repeat(40) };
const req = (path: string, headers: Record<string, string> = {}) => new Request("https://stats.example" + path, { headers });

describe("dashboard link access", () => {
  it("the secret link sets a long-lived private cookie and removes the token from the address", async () => {
    const res = await handleDashboard(req("/dashboard?k=" + "t".repeat(40)), ENV, NOW, noFetch);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/dashboard");
    const c = res.headers.get("Set-Cookie") ?? "";
    expect(c).toMatch(/^lfm_dash=[a-f0-9]{64};/);
    expect(c).not.toContain("t".repeat(40));
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/dashboard", "Max-Age=31536000"]) expect(c).toContain(flag);
  });

  it("the cookie opens the dashboard without a password", async () => {
    const first = await handleDashboard(req("/dashboard?k=" + "t".repeat(40)), ENV, NOW, noFetch);
    const cookie = (first.headers.get("Set-Cookie") ?? "").split(";")[0];
    const res = await handleDashboard(req("/dashboard", { Cookie: "other=1; " + cookie }), ENV, NOW, noFetch);
    expect(res.status).toBe(200);
  });

  it("a wrong link or a forged cookie gets nothing", async () => {
    expect((await handleDashboard(req("/dashboard?k=wrong"), ENV, NOW, noFetch)).status).toBe(401);
    expect((await handleDashboard(req("/dashboard", { Cookie: "lfm_dash=" + "0".repeat(64) }), ENV, NOW, noFetch)).status).toBe(401);
  });

  it("without the link secret configured, links never work", async () => {
    const res = await handleDashboard(req("/dashboard?k="), { DB: db, DASH_PASSWORD: "pw" }, NOW, noFetch);
    expect(res.status).toBe(401);
  });

  it("the password still works", async () => {
    const res = await handleDashboard(req("/dashboard", { Authorization: "Basic " + btoa("x:pw") }), ENV, NOW, noFetch);
    expect(res.status).toBe(200);
  });
});
