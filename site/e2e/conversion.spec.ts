import { test, expect } from "@playwright/test";

// Hero and #download as a visitor from the social videos sees them: on a phone, where the app
// cannot be installed, and on a computer, where it can.
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PHONE_LINE = "LinerFM runs on Mac and Windows. Open this page on your computer to install it.";
const PROMISE = "Your desktop plays the song you're on.";

test.beforeEach(async ({ page }) => {
  // Nothing leaves the test: no stats worker, no GitHub API.
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

// Una sola immagine dappertutto (bio, primo fotogramma dei video, sito): il desktop che diventa la canzone.
test("the title is the one promise, shown by the live desktop footage", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(PROMISE);
  const hero = page.locator("#top");
  await expect(hero.locator("video source[src$='clip-live-desktop.mp4']")).toHaveCount(1);
  // la 1.0.0 su Windows non ha il desktop dal vivo: il sito lo dice dove lo mostra
  await expect(hero.getByText("live wallpaper is Mac only for now", { exact: false })).toBeVisible();
});

test("the live desktop footage is shown once, in the hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("video source[src$='clip-live-desktop.mp4']")).toHaveCount(1);
});

test.describe("on a phone (375 px, iPhone)", () => {
  test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true });

  test("says it is a computer app in the first screen, and keeps Try free and Buy", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("#top");
    const line = hero.getByText(PHONE_LINE);
    await expect(line).toBeVisible();
    const box = (await line.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    await expect(hero.getByRole("link", { name: "Try free for 5 days" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Buy · 10€" })).toBeVisible();
  });

  test("#download shows the installers and the first launch steps, as on a computer", async ({ page }) => {
    await page.goto("/#download");
    const dl = page.locator("#download");
    await expect(dl.getByText("First launch on macOS")).toBeVisible();
    await expect(dl.getByText("First launch on Windows")).toBeVisible();
    await expect(dl.getByText("Not sure? Apple menu", { exact: false })).toBeVisible();
  });

  test("nobody is asked for an email to get the link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "Your email" })).toHaveCount(0);
  });

  test("no element is wider than the screen", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("on a desktop (1280 px, Mac)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, userAgent: MAC_UA });

  test("the hero keeps Try free, without the phone line", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("#top");
    await expect(hero.getByRole("link", { name: "Try free for 5 days" })).toBeVisible();
    await expect(hero.getByText(PHONE_LINE)).toBeHidden();
  });

  test("#download keeps the installers' place and both first launch guides", async ({ page }) => {
    await page.goto("/#download");
    const dl = page.locator("#download");
    await expect(dl.getByText("First launch on macOS")).toBeVisible();
    await expect(dl.getByText("First launch on Windows")).toBeVisible();
    await expect(dl.getByText("Not sure? Apple menu", { exact: false })).toBeVisible();
  });
});

// Ogni Buy porta all'ordine Lemon Squeezy il canale della visita: senza, una vendita non dice da dove arriva.
// Playwright non viene contato (navigator.webdriver), quindi qui il canale è "direct".
test("every Buy link passes the visit's channel to the checkout", async ({ page }) => {
  await page.goto("/?src=reddit-macapps");
  const links = page.locator("a.lemonsqueezy-button");
  expect(await links.count()).toBeGreaterThan(0);
  for (const href of await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
    const q = new URL(href).searchParams;
    expect(q.get("checkout[custom][src]")).toBe("direct");
    expect(q.get("embed")).toBe("1");
  }
});

test("a Buy link carries the channel remembered for the tab", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("lfm_src", "reddit-macapps"));
  await page.goto("/");
  const href = await page.locator("#top a.lemonsqueezy-button").first().getAttribute("href");
  expect(new URL(href!).searchParams.get("checkout[custom][src]")).toBe("reddit-macapps");
});
