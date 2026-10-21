import { test, expect } from "@playwright/test";

// Hero and #download as a visitor from the social videos sees them: on a phone, where the app
// cannot be installed, and on a computer, where it can.
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PHONE_LINE = "LinerFM runs on Mac and Windows, not on phones.";

test.beforeEach(async ({ page }) => {
  // Nothing leaves the test: no stats worker, no GitHub API.
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test("the title says what LinerFM is and where it runs", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveText(/lyrics/i);
  await expect(h1).toHaveText(/Mac/);
  await expect(h1).toHaveText(/PC|Windows/);
});

test.describe("on a phone (375 px, iPhone)", () => {
  test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true });

  test("says it is a computer app before asking for the email, all in the first screen", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("#top");
    const line = hero.getByText(PHONE_LINE);
    await expect(line).toBeVisible();
    const lineBox = (await line.boundingBox())!;
    const fieldBox = (await hero.getByRole("textbox", { name: "Your email" }).boundingBox())!;
    expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(fieldBox.y);
    expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(667);
  });

  test("the hero offers no Try free link that leads to downloads, only the form and Buy", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("#top");
    await expect(hero.getByRole("link", { name: "Try free for 5 days" })).toBeHidden();
    await expect(hero.getByRole("link", { name: "Buy · 10€" })).toBeVisible();
  });

  test("Try free in the bar lands on the email form, not on installers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Try free" }).click();
    await expect(page).toHaveURL(/#download$/);
    const dl = page.locator("#download");
    await expect(dl.getByRole("textbox", { name: "Your email" })).toBeInViewport();
  });

  test("#download hides the installers and the first launch steps", async ({ page }) => {
    await page.goto("/#download");
    const dl = page.locator("#download");
    await expect(dl.getByText("Open the link on your Mac or PC", { exact: false })).toBeVisible();
    await expect(dl.getByText("First launch on macOS")).toBeHidden();
    await expect(dl.getByText("First launch on Windows")).toBeHidden();
    await expect(dl.getByText("Not sure? Apple menu", { exact: false })).toBeHidden();
    await expect(dl.getByText(/Loading latest version|Download ·|See all downloads/).first()).toBeHidden();
  });

  test("no element is wider than the screen", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("on a desktop (1280 px, Mac)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, userAgent: MAC_UA });

  test("the hero keeps Try free and the full description, without the phone line", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("#top");
    await expect(hero.getByRole("link", { name: "Try free for 5 days" })).toBeVisible();
    await expect(hero.getByText("LinerFM puts your music all over your desktop", { exact: false })).toBeVisible();
    await expect(hero.getByText(PHONE_LINE)).toBeHidden();
  });

  test("#download keeps the installers' place and both first launch guides", async ({ page }) => {
    await page.goto("/#download");
    const dl = page.locator("#download");
    await expect(dl.getByText("First launch on macOS")).toBeVisible();
    await expect(dl.getByText("First launch on Windows")).toBeVisible();
    await expect(dl.getByText("Not sure? Apple menu", { exact: false })).toBeVisible();
    await expect(dl.getByText("Open the link on your Mac or PC", { exact: false })).toBeHidden();
  });
});
