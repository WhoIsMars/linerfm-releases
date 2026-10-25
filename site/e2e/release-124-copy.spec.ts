import { test, expect } from "@playwright/test";

// 25/10, release 1.2.3 e 1.2.4: la griglia che leggeva features.json non c'e' piu', quindi la home
// deve dirlo a parole. Card: desktop-cover (1.2.3), lyrics-every-source (1.2.0) e lyrics-from-spotify (1.2.2).
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test("the live desktop says the canvas can fill the whole screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#colors")).toContainText("The Spotify canvas can fill your whole desktop");
});

test("the page says the lyrics cover Spotify, YouTube and SoundCloud", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toContainText("synced lyrics for Spotify, YouTube and SoundCloud");
});
