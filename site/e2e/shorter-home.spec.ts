import { test, expect } from "@playwright/test";

// 22/10: la home aveva 9 sezioni e il prezzo arrivava dopo il 72% della pagina (8.159 px su 11.377 a 1280 px).
// Accorciata a 7: WhatsNew e Promise tolte, 8 feature in vista e le altre dietro "See all".
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test.describe("on a desktop (1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the price comes before 65% of the page, in at most 7 sections", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(() => ({
      sections: document.querySelectorAll("main > section").length,
      height: document.documentElement.scrollHeight,
      pricing: document.querySelector("#pricing")!.getBoundingClientRect().top + scrollY,
    }));
    expect(r.sections).toBeLessThanOrEqual(7);
    expect(r.pricing / r.height).toBeLessThan(0.65);
  });

  test("8 features in view, the others behind See all", async ({ page }) => {
    await page.goto("/");
    const features = page.locator("#features");
    await expect(features.locator("h3:visible")).toHaveCount(8);
    const button = features.getByText(/See all \d+ features/);
    const total = Number((await button.textContent())!.match(/\d+/)![0]);
    await button.click();
    await expect(features.locator("h3:visible")).toHaveCount(total);
  });
});

// L'id della domanda va nell'evento faq_open: il worker accetta [a-z0-9_-] fino a 20 caratteri.
test("every FAQ question has its own short id for faq_open", async ({ page }) => {
  await page.goto("/");
  const ids = await page.locator("#faq details").evaluateAll((ds) => ds.map((d) => (d as HTMLElement).dataset.faq ?? ""));
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).toMatch(/^[a-z0-9_-]{1,20}$/);
  // le obiezioni che fermano un download vengono prima
  expect(ids.slice(0, 3)).toEqual(["safe", "warning-mac", "warning-windows"]);
});

// Pagine per chi arriva da una ricerca: un titolo, i pulsanti, e nessuna promessa su Windows di cose solo Mac.
for (const [path, h1] of [
  ["/lyrics", "Spotify lyrics on your desktop"],
  ["/notch", "Spotify in your MacBook notch"],
  ["/vs/boring-notch", "LinerFM or Boring Notch"],
  ["/vs/notchnook", "A NotchNook alternative for music"],
  ["/vs/rainmeter", "Rainmeter for Spotify, or something that just works"],
] as const) {
  test(`${path} has its title, the two buttons and is linked from the home`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    await expect(page.getByRole("link", { name: "Try free for 5 days" })).toBeVisible();
    await expect(page.locator("main a.lemonsqueezy-button")).toHaveCount(1);
    expect(await page.locator("body").innerText()).not.toMatch(/Mac only/i);
    await page.goto("/");
    await expect(page.locator(`footer a[href$="${path}"]`)).toHaveCount(1);
  });
}

test("a comparison names its sources and the day they were read", async ({ page }) => {
  await page.goto("/vs/boring-notch");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("checked on 22 October 2026", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Boring Notch on GitHub" })).toHaveAttribute("href", "https://github.com/TheBoredTeam/boring.notch");
});
