import { test, expect } from "@playwright/test";

// 24/10, owner da iPhone: il tasto pausa da 44 px copriva l'ora nella notch e una riga della
// finestra AI. Da telefono si vede piccolo, ma l'area di tocco resta 44 px.
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test("the pause button is small on a phone and still pauses the video", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator("#notch [data-video-toggle]");
  await toggle.evaluate((x) => x.scrollIntoView({ block: "center" }));
  // il video entra salendo di 50 px in 1,2 s: si clicca solo a tasto fermo
  let box = (await toggle.boundingBox())!;
  await expect.poll(async () => { const b = (await toggle.boundingBox())!; const still = Math.abs(b.y - box.y) < 0.5; box = b; return still; }, { intervals: [200] }).toBe(true);
  expect(box.width).toBeLessThanOrEqual(32);
  // un tocco 6 px fuori dal cerchio cade ancora sul tasto
  await page.mouse.click(box.x - 6, box.y + box.height / 2);
  await expect(toggle).toHaveAttribute("aria-label", "Play video");
});
