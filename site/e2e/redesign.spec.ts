import { test, expect, type Page } from "@playwright/test";

// 24/10/2026, home rifatta sul modello di iBaila (owner): poche sezioni, una per schermo, una frase e
// una ripresa vera ciascuna, scorrimento a scatti morbido, comparse al passaggio, "No account. Pay once."
// Le riprese vengono dal telefono dell'owner (public/media), non piu' dai video resi dalla UI (public/video).
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

const sections = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main > section")].map((s) => ({
      id: s.id,
      snap: getComputedStyle(s).scrollSnapAlign,
      height: s.getBoundingClientRect().height,
    })),
  );

for (const [label, viewport] of [["1440x900", { width: 1440, height: 900 }], ["375x812", { width: 375, height: 812 }]] as const) {
  test.describe(`at ${label}`, () => {
    test.use({ viewport });

    test("the page snaps by sections, each at least one screen tall", async ({ page }) => {
      await page.goto("/");
      const html = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
      // "proximity" e' il valore di partenza e il browser lo omette: "y" e "y proximity" sono la stessa cosa
      expect(html).toMatch(/^y( proximity)?$/);
      const list = await sections(page);
      expect(list.length).toBeGreaterThanOrEqual(7);
      for (const s of list) {
        expect(s.snap, s.id).toMatch(/start/);
        expect(s.height, s.id).toBeGreaterThanOrEqual(viewport.height - 1);
      }
    });

    test("the hero says no account, the trial and the price in one line", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("#top").getByText("No account. 5 days free. 10€ once.")).toBeVisible();
    });

    test("nothing is wider than the screen", async ({ page }) => {
      await page.goto("/");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test.describe("at 1440x900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("every video on the home is a real take from public/media", async ({ page }) => {
    await page.goto("/");
    const srcs = await page.locator("main video source, main video[src]").evaluateAll((els) =>
      els.map((e) => e.getAttribute("src") ?? ""),
    );
    expect(srcs.length).toBeGreaterThanOrEqual(4);
    for (const s of srcs) expect(s).toMatch(/\/media\/[a-z-]+\.mp4$/);
    await expect(page.locator("#top video[src$='media/hero.mp4']")).toHaveCount(1);
  });

  test("each feature screen has one sentence and one media, and the ones without footage stay out", async ({ page }) => {
    await page.goto("/");
    const screens = page.locator("[data-feature]");
    expect(await screens.count()).toBeGreaterThanOrEqual(4);
    for (const s of await screens.all()) {
      await expect(s.locator("h2")).toHaveCount(1);
      await expect(s.locator("video, img")).toHaveCount(1);
    }
    // senza ripresa vera la sezione non esiste: l'owner registrera' lo schermo
    for (const id of ["notch", "screensaver", "ai-playlists"]) await expect(page.locator(`#${id}`)).toHaveCount(0);
  });

  test("the platforms row names sources and systems as text, with no brand logos", async ({ page }) => {
    await page.goto("/");
    const w = page.locator("#works-with");
    for (const name of ["Spotify", "Apple Music", "YouTube Music", "SoundCloud", "Mac", "Windows"]) {
      await expect(w.getByRole("heading", { name, exact: true })).toBeVisible();
    }
    await expect(w).toContainText("app you already use");
    // il riquadro 24x24 dei loghi di Simple Icons non c'e' piu'
    await expect(w.locator('svg[viewBox="0 0 24 24"] path[d^="M12 0C5.4"]')).toHaveCount(0);
  });

  test("pricing is a section of its own called No account. Pay once.", async ({ page }) => {
    await page.goto("/");
    const p = page.locator("#pricing");
    await expect(p.getByRole("heading", { level: 2 })).toHaveText("No account. Pay once.");
    await expect(p).toContainText("Minor updates included");
    await expect(p).toContainText("Move your license");
  });

  test("the FAQ is short: six questions, the battery one without numbers", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#faq details")).toHaveCount(6);
    await expect(page.locator('#faq details[data-faq="power"] p')).toContainText("I have no battery numbers to quote");
  });

  test("the download comes last, for Mac and Windows, with the SmartScreen steps", async ({ page }) => {
    await page.goto("/");
    const ids = (await sections(page)).map((s) => s.id);
    expect(ids.at(-1)).toBe("download");
    expect(ids.indexOf("faq")).toBe(ids.length - 2);
    await expect(page.locator("#download")).toContainText("“More info”, then “Run anyway”");
  });

  test("sections fade in when they arrive, and the video waits to be on screen", async ({ page }) => {
    await page.goto("/");
    const item = page.locator("#pricing [data-reveal]").first();
    await expect.poll(() => item.evaluate((e) => Number(getComputedStyle(e).opacity))).toBeLessThan(1);
    const video = page.locator("[data-feature] video").first();
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    await expect.poll(() => item.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1);
  });

  test("with reduced motion nothing waits to appear and nothing plays by itself", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const item = page.locator("#pricing [data-reveal]").first();
    expect(await item.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1);
    expect(await page.locator("#top video").evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    const behavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    expect(behavior).toBe("auto");
  });

  test("no em dash or double hyphen in the copy", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/—|--/);
  });
});
