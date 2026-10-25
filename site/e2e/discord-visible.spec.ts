import { test, expect } from "@playwright/test";

// 25/10, owner: "nel Discord non entra nessuno". Il link sta nella barra anche da telefono, il
// pulsante della sezione è verde come le azioni principali, e ogni invito dice da dove parte il
// clic (data-discord), che il sito conta come evento "discord" (lib/stats.ts, stats/src/hit.ts).
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const INVITE = "https://discord.gg/vhU22mKHAr";
const PLACES = ["nav", "hero", "section", "pricing", "faq", "footer", "hint"];

test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test.describe("on a phone (375 px, iPhone)", () => {
  test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true });

  test("the top bar shows Discord next to Try free, inside the screen", async ({ page }) => {
    await page.goto("/");
    const link = page.locator("header").getByRole("link", { name: "Discord" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", INVITE);
    await expect(page.locator("header").getByRole("link", { name: "Try free" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("the Discord section button is a primary, green button", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#community").getByRole("link", { name: "Join the Discord" })).toHaveClass(/btn-primary/);
});

test("every Discord invite on the home says where it is, for the click count", async ({ page }) => {
  await page.goto("/");
  const places = await page.locator(`a[href="${INVITE}"]`).evaluateAll((as) => as.map((a) => (a as HTMLElement).dataset.discord ?? ""));
  expect(places.length).toBeGreaterThanOrEqual(6);
  for (const p of places) expect(PLACES).toContain(p);
});
