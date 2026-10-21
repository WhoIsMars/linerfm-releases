import { test, expect } from "@playwright/test";

// TikTok gives LinerFM no clickable link: the bio carries "linerfm.xyz/tt" as text, people type it,
// and the visit must still count as TikTok. /tt hands over to the home with ?src=tiktok, which
// track() remembers for the whole tab.
for (const [label, viewport] of [["375 px", { width: 375, height: 667 }], ["1280 px", { width: 1280, height: 800 }]] as const) {
  test(`/tt opens the home tagged as TikTok (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
    await page.goto("/tt");
    await expect(page).toHaveURL(/\/\?src=tiktok$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Mac and PC/);
  });
}

test("/tt/ with a trailing slash works too", async ({ page }) => {
  await page.goto("/tt/");
  await expect(page).toHaveURL(/\/\?src=tiktok$/);
});

test("/tt asks search engines not to index it", async ({ request }) => {
  const html = await (await request.get("/tt")).text();
  expect(html).toContain('name="robots" content="noindex"');
});
