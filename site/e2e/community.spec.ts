import { test, expect } from "@playwright/test";

// 25/10, richiesta dell'owner (opzione 2): Discord con un motivo per entrare, visibile anche da
// telefono (nella barra è solo da md in su), e un invito subito dopo il download.
// Ogni motivo è vero oggi: #support e /ticket (worker/src/discord.ts dell'app), il ruolo
// Customer con "Discord in one click" (features.json, 1.2.4).
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const INVITE = "https://discord.gg/vhU22mKHAr";

test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ tag_name: "v1.2.4", html_url: "https://github.com/WhoIsMars/linerfm-releases/releases/tag/v1.2.4", assets: [
      { name: "LinerFM_1.2.4_aarch64.dmg", size: 34700000, browser_download_url: "https://example.test/LinerFM_1.2.4_aarch64.dmg" },
      { name: "LinerFM_1.2.4_x64.dmg", size: 38000000, browser_download_url: "https://example.test/LinerFM_1.2.4_x64.dmg" },
      { name: "LinerFM_1.2.4_x64-setup.exe", size: 31400000, browser_download_url: "https://example.test/LinerFM_1.2.4_x64-setup.exe" },
    ] }),
  }));
  // the installer itself is never downloaded: the click stays on the page
  await page.route("https://example.test/**", (r) => r.fulfill({ status: 204 }));
});

for (const [name, use] of [
  ["phone", { viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true }],
  ["desktop", { viewport: { width: 1280, height: 800 }, userAgent: MAC_UA }],
] as const) {
  test.describe(`on a ${name}`, () => {
    test.use(use);

    test("a Discord section before the FAQ says why to join and links the invite", async ({ page }) => {
      await page.goto("/");
      const c = page.locator("#community");
      await c.scrollIntoViewIfNeeded();
      await expect(c.getByRole("heading", { level: 2 })).toBeVisible();
      await expect(c.getByText("#support", { exact: false })).toBeVisible();
      await expect(c.getByRole("heading", { name: "The Customer role" })).toBeVisible();
      const join = c.getByRole("link", { name: "Join the Discord" });
      await expect(join).toBeVisible();
      await expect(join).toHaveAttribute("href", INVITE);
      const order = await page.evaluate(() => [...document.querySelectorAll("main > section[id]")].map((s) => s.id));
      expect(order.indexOf("community")).toBe(order.indexOf("faq") - 1);
    });
  });
}

test.describe("after a download (1280 px, Mac)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, userAgent: MAC_UA });

  test("the first launch hint invites to the Discord", async ({ page }) => {
    await page.goto("/#download");
    const dl = page.locator("#download");
    await dl.getByRole("link", { name: /Download · Apple Silicon/ }).click();
    const hint = dl.getByRole("status");
    await expect(hint).toContainText("If macOS blocks the first launch");
    await expect(hint.getByRole("link", { name: "Discord" })).toHaveAttribute("href", INVITE);
  });
});
