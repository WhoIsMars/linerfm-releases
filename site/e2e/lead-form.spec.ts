import { test, expect, type Page, type Request } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const BUTTON = "Send me the link for my Mac or PC";
const LINE = "Free for 5 days. We email you the download link, nothing else.";

// The worker is never called for real: every POST to /lead is answered here and recorded.
async function mockLead(page: Page, status = 204) {
  const calls: Request[] = [];
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", async (route) => {
    calls.push(route.request());
    await route.fulfill({ status, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  return calls;
}

test.describe("on a phone (375 px, iPhone)", () => {
  test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true });

  test("shows the email form above the fold and again in #download", async ({ page }) => {
    await mockLead(page);
    await page.goto("/");
    const hero = page.locator("#top");
    const top = hero.getByRole("textbox", { name: "Your email" });
    await expect(top).toBeVisible();
    await expect(hero.getByRole("button", { name: BUTTON })).toBeVisible();
    await expect(hero.getByText(LINE)).toBeVisible();
    // Above the fold: the button is inside the first screen without scrolling.
    const box = await hero.getByRole("button", { name: BUTTON }).boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(667);

    const dl = page.locator("#download");
    await dl.scrollIntoViewIfNeeded();
    await expect(dl.getByRole("textbox", { name: "Your email" })).toBeVisible();
    await expect(dl.getByRole("button", { name: BUTTON })).toBeVisible();
  });

  test("sends email and ?src= in a POST body, never in a URL", async ({ page }) => {
    const calls = await mockLead(page);
    await page.goto("/?src=tiktok");
    const hero = page.locator("#top");
    await hero.getByRole("textbox", { name: "Your email" }).fill(" Someone@Example.com ");
    await hero.getByRole("button", { name: BUTTON }).click();
    await expect(hero.getByText("Got it. We'll email you the download link soon.", { exact: false })).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0].method()).toBe("POST");
    expect(new URL(calls[0].url()).pathname).toBe("/lead");
    expect(new URL(calls[0].url()).search).toBe("");
    expect(JSON.parse(calls[0].postData() ?? "")).toEqual({ e: "someone@example.com", s: "tiktok" });
    expect(page.url()).not.toContain("example.com");
  });

  test("a wrong address is caught before anything is sent, and the text stays", async ({ page }) => {
    const calls = await mockLead(page);
    await page.goto("/");
    const hero = page.locator("#top");
    const box = hero.getByRole("textbox", { name: "Your email" });
    await box.fill("nobody@nowhere");
    await hero.getByRole("button", { name: BUTTON }).click();
    await expect(hero.getByRole("alert")).toContainText("doesn't look right");
    await expect(box).toHaveValue("nobody@nowhere");
    expect(calls).toHaveLength(0);
  });

  test("says so when the worker refuses for too many tries", async ({ page }) => {
    await mockLead(page, 429);
    await page.goto("/");
    const hero = page.locator("#top");
    await hero.getByRole("textbox", { name: "Your email" }).fill("someone@example.com");
    await hero.getByRole("button", { name: BUTTON }).click();
    await expect(hero.getByRole("alert")).toContainText("Too many tries");
  });
});

test.describe("on an iPad in landscape (1180 px, reports itself as a Mac)", () => {
  test.use({ viewport: { width: 1180, height: 820 }, userAgent: IPAD_UA, isMobile: true, hasTouch: true });

  test("still gets the form, because it can't install the app either", async ({ page }) => {
    // A real iPad reports 5 touch points; Chromium's touch emulation reports 1.
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }));
    await page.goto("/");
    await expect(page.locator("#top").getByRole("textbox", { name: "Your email" })).toBeVisible();
  });
});

test.describe("on a desktop (1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, userAgent: MAC_UA });

  test("does not show the form anywhere, the page stays as it was", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "Your email", includeHidden: true })).toHaveCount(2);
    for (const box of await page.getByRole("textbox", { name: "Your email", includeHidden: true }).all()) await expect(box).toBeHidden();
    await expect(page.getByText(LINE).first()).toBeHidden();
    await expect(page.locator("#top").getByRole("link", { name: "Try free for 5 days" })).toBeVisible();
  });
});
