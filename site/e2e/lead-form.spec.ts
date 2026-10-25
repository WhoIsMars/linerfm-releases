import { test, expect, type Page, type Request } from "@playwright/test";

// 25/10, richiesta dell'owner: da telefono torna il campo email (opzione 1), ma accanto ai
// download, non al loro posto come il 21/10. Vive solo in #download, dove porta "Try free":
// il primo schermo resta com'è. L'invio del link è a mano finché non c'è un servizio email
// (stats/scripts/leads.mjs), quindi la riga promette solo il link.
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const BUTTON = "Email me the link for my Mac or PC";
const LINE = "We email you the download link, nothing else.";
const RELEASE = {
  tag_name: "v1.2.4", html_url: "https://github.com/WhoIsMars/linerfm-releases/releases/tag/v1.2.4", assets: [
    { name: "LinerFM_1.2.4_aarch64.dmg", size: 34700000, browser_download_url: "https://example.test/LinerFM_1.2.4_aarch64.dmg" },
    { name: "LinerFM_1.2.4_x64.dmg", size: 38000000, browser_download_url: "https://example.test/LinerFM_1.2.4_x64.dmg" },
    { name: "LinerFM_1.2.4_x64-setup.exe", size: 31400000, browser_download_url: "https://example.test/LinerFM_1.2.4_x64-setup.exe" },
  ],
};

// Nothing reaches the real worker: /hit is answered 204, every POST to /lead is answered here and recorded.
async function mockWorker(page: Page, status = 204) {
  const calls: Request[] = [];
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/lead") calls.push(route.request());
    await route.fulfill({ status: new URL(route.request().url()).pathname === "/lead" ? status : 204, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RELEASE) }));
  return calls;
}

test.describe("on a phone (375 px, iPhone)", () => {
  test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true });

  test("#download has the email box and still the installers under it", async ({ page }) => {
    await mockWorker(page);
    await page.goto("/#download");
    const dl = page.locator("#download");
    const box = dl.getByRole("textbox", { name: "Your email" });
    await expect(box).toBeVisible();
    await expect(dl.getByRole("button", { name: BUTTON })).toBeVisible();
    await expect(dl.getByText(LINE)).toBeVisible();
    // the installers sit under the box, out of the first screen: they load when scrolled to (client:visible)
    await dl.getByText("Not sure? Apple menu", { exact: false }).scrollIntoViewIfNeeded();
    const install = dl.getByRole("link", { name: /Download · Apple Silicon/ });
    await expect(install).toBeVisible();
    await expect(install).toHaveAttribute("href", /aarch64\.dmg$/);
    await expect(dl.getByRole("link", { name: /Download · Windows/ })).toBeVisible();
    expect((await box.boundingBox())!.y).toBeLessThan((await install.boundingBox())!.y);
  });

  test("the first screen is unchanged: Try free and Buy, no email box", async ({ page }) => {
    await mockWorker(page);
    await page.goto("/");
    const hero = page.locator("#top");
    await expect(hero.getByRole("link", { name: "Try free for 5 days" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Buy · 10€" })).toBeVisible();
    await expect(hero.getByRole("textbox", { name: "Your email" })).toHaveCount(0);
  });

  test("sends email and ?src= in a POST body, never in a URL", async ({ page }) => {
    const calls = await mockWorker(page);
    await page.goto("/?src=tiktok#download");
    const dl = page.locator("#download");
    await dl.getByRole("textbox", { name: "Your email" }).fill(" Someone@Example.com ");
    await dl.getByRole("button", { name: BUTTON }).click();
    await expect(dl.getByText("Got it. We'll email you the download link soon.", { exact: false })).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0].method()).toBe("POST");
    expect(new URL(calls[0].url()).search).toBe("");
    expect(JSON.parse(calls[0].postData() ?? "")).toEqual({ e: "someone@example.com", s: "tiktok" });
    expect(page.url()).not.toContain("example.com");
  });

  test("a wrong address is caught before anything is sent, and the text stays", async ({ page }) => {
    const calls = await mockWorker(page);
    await page.goto("/#download");
    const dl = page.locator("#download");
    const box = dl.getByRole("textbox", { name: "Your email" });
    await box.fill("nobody@nowhere");
    await dl.getByRole("button", { name: BUTTON }).click();
    await expect(dl.getByRole("alert")).toContainText("doesn't look right");
    await expect(box).toHaveValue("nobody@nowhere");
    expect(calls).toHaveLength(0);
  });

  test("says so when the worker refuses for too many tries", async ({ page }) => {
    await mockWorker(page, 429);
    await page.goto("/#download");
    const dl = page.locator("#download");
    await dl.getByRole("textbox", { name: "Your email" }).fill("someone@example.com");
    await dl.getByRole("button", { name: BUTTON }).click();
    await expect(dl.getByRole("alert")).toContainText("Too many tries");
  });
});

test.describe("on an iPad in landscape (1180 px, reports itself as a Mac)", () => {
  test.use({ viewport: { width: 1180, height: 820 }, userAgent: IPAD_UA, isMobile: true, hasTouch: true });

  test("still gets the email box, because it can't install the app either", async ({ page }) => {
    // A real iPad reports 5 touch points; Chromium's touch emulation reports 1.
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }));
    await mockWorker(page);
    await page.goto("/#download");
    await expect(page.locator("#download").getByRole("textbox", { name: "Your email" })).toBeVisible();
  });
});

test.describe("on a desktop (1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, userAgent: MAC_UA });

  test("does not show the email box, the download buttons stay as they were", async ({ page }) => {
    await mockWorker(page);
    await page.goto("/#download");
    await expect(page.getByRole("textbox", { name: "Your email" })).toBeHidden();
    await expect(page.locator("#download").getByRole("link", { name: /Download · Apple Silicon/ })).toBeVisible();
  });
});
