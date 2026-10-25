import { test, expect, type Page } from "@playwright/test";

// 24/10, richiesta dell'owner: widget, notch e screensaver devono far vedere i loro stili.
// I video veri cambiano look o tema a tempi noti (misurati sui fotogrammi): il chip con quel
// nome si accende mentre lo stile è in video, e un clic sul chip porta il video lì.
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test.use({ viewport: { width: 1440, height: 900 } });

async function seek(page: Page, id: string, t: number) {
  const video = page.locator(`#${id} video`);
  // scroll diretto: la cornice accesa respira di continuo e Playwright aspetterebbe che stia ferma
  await video.evaluate((v) => v.scrollIntoView({ block: "center" }));
  // il video è "lazy": parte da solo quando entra nello schermo; si aspetta quel caricamento
  // invece di forzarne un secondo che lo interromperebbe
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  // niente attesa su "seeked": se il seek interrompe il play del caricamento pigro, Chromium
  // a volte non lo emette; conta solo che il tempo sia quello chiesto
  await video.evaluate((v: HTMLVideoElement, t) => { v.pause(); v.currentTime = t; }, t);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(t, 1);
}

const current = (page: Page, id: string) => page.locator(`#${id} [data-cue][aria-current="true"]`);

for (const [id, t, label] of [
  ["widget", 4.8, "Compact"],
  ["widget", 6.2, "Terminal"],
  ["screensaver", 2.4, "Onyx"],
  ["screensaver", 4.0, "Glass"],
  ["screensaver", 5.6, "Vinyl"],
  ["ai-playlists", 2.0, "Create playlist"],
  ["ai-playlists", 7.0, "Add tracks"],
  ["ai-playlists", 12.5, "Find playlist"],
  ["ai-playlists", 18.0, "Optimize"],
] as const) {
  test(`${id} at ${t}s lights ${label}`, async ({ page }) => {
    await page.goto("/");
    await seek(page, id, t);
    await expect(current(page, id)).toHaveCount(1);
    await expect(current(page, id)).toHaveText(label);
  });
}

test("clicking a style chip moves the video to that style", async ({ page }) => {
  await page.goto("/");
  await seek(page, "screensaver", 0.5);
  await page.locator("#screensaver").getByRole("button", { name: "Glass" }).click();
  const t = await page.locator("#screensaver video").evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t).toBeGreaterThanOrEqual(3.2);
  expect(t).toBeLessThan(4.8);
  await expect(current(page, "screensaver")).toHaveText("Glass");
});

// 25/10 pomeriggio, owner: da iPhone la notch era tagliata e i temi non si cliccavano. Ora il video
// è la ripresa vera (0-8,4 s, tema Artwork) seguita dai cinque temi presi dalla UI dell'app.
for (const [t, label] of [[3.0, "Artwork"], [9.0, "Artwork"], [10.6, "Onyx"], [12.0, "Glass"], [13.4, "Vinyl"], [15.6, "Midnight"]] as const) {
  test(`notch at ${t}s lights ${label}`, async ({ page }) => {
    await page.goto("/");
    await seek(page, "notch", t);
    await expect(current(page, "notch")).toHaveText(label);
  });
}

test("clicking a notch theme moves the video to that theme, and says which part is real", async ({ page }) => {
  await page.goto("/");
  await seek(page, "notch", 0.5);
  const notch = page.locator("#notch");
  for (const name of ["Artwork", "Onyx", "Glass", "Vinyl", "Midnight"]) await expect(notch.getByRole("button", { name })).toHaveCount(1);
  await notch.getByRole("button", { name: "Vinyl" }).click();
  const t = await page.locator("#notch video").evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t).toBeGreaterThanOrEqual(12.8);
  expect(t).toBeLessThan(14.83);
  await expect(current(page, "notch")).toHaveText("Vinyl");
  await expect(notch.locator("figure[data-take] > figcaption")).toContainText("Real footage first");
});

test("the screensaver shows all five styles as buttons", async ({ page }) => {
  await page.goto("/");
  const ss = page.locator("#screensaver");
  for (const name of ["Artwork", "Onyx", "Glass", "Vinyl", "Midnight"]) await expect(ss.getByRole("button", { name })).toHaveCount(1);
});

test("all four AI tools are buttons on the video", async ({ page }) => {
  await page.goto("/");
  const ai = page.locator("#ai-playlists");
  for (const name of ["Create playlist", "Find playlist", "Add tracks", "Optimize"]) await expect(ai.getByRole("button", { name })).toHaveCount(1);
});
