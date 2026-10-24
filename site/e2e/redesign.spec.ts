import { test, expect, type Page } from "@playwright/test";

// 24/10/2026, home rifatta sul modello di iBaila (owner): una frase e un media vero per sezione, comparse
// al passaggio, "No account. Pay once." Seconda passata, stesso giorno: via lo scatto a schermo intero
// (scroll-snap), al suo posto lo scorrimento morbido di Lenis e un ritmo regolare fra le sezioni; ogni
// media nella cornice con la luce ai bordi; i loghi veri delle piattaforme (simple-icons); widget,
// notch, screensaver e AI con le catture della UI vera (owner, 16:35: "DEVONO comparire").
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

const sections = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main > section")].map((s) => ({
      id: s.id,
      height: s.getBoundingClientRect().height,
    })),
  );

for (const [label, viewport] of [["1440x900", { width: 1440, height: 900 }], ["375x812", { width: 375, height: 812 }]] as const) {
  test.describe(`at ${label}`, () => {
    test.use({ viewport });

    // Cambiato apposta nella seconda passata: prima ogni sezione era alta uno schermo e lo scorrimento
    // scattava; ora niente scatto, e nessuna sezione e' piu' bassa di meta' schermo (niente righe orfane).
    test("the page scrolls freely, without snapping, in sections of real height", async ({ page }) => {
      await page.goto("/");
      const html = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
      expect(html).toBe("none");
      const list = await sections(page);
      expect(list.length).toBeGreaterThanOrEqual(11);
      for (const s of list) expect(s.height, s.id).toBeGreaterThanOrEqual(viewport.height * 0.5);
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

  test("each feature section has one title and one media, and the ones without media stay out", async ({ page }) => {
    await page.goto("/");
    const screens = page.locator("[data-feature]");
    expect(await screens.count()).toBeGreaterThanOrEqual(7);
    for (const s of await screens.all()) {
      await expect(s.locator("h2")).toHaveCount(1);
      await expect(s.locator("video, img")).toHaveCount(1);
    }
    for (const id of ["lyrics", "source"]) await expect(page.locator(`#${id}`)).toHaveCount(0);
  });

  // Owner, 24/10 16:35: le quattro feature grosse con la loro sezione, un media vero e i nomi veri.
  test("widget, notch, screensaver and AI playlists each have a section, a real capture and their real names", async ({ page }) => {
    await page.goto("/");
    const want: Record<string, { video: string; chips: string[] }> = {
      widget: { video: "media/widget.mp4", chips: ["Glass", "Cinematic", "Minimal", "Compact", "Terminal"] },
      notch: { video: "media/notch.mp4", chips: ["Artwork", "Onyx", "Glass", "Vinyl", "Midnight"] },
      screensaver: { video: "media/screensaver.mp4", chips: ["Artwork", "Onyx", "Glass", "Vinyl", "Midnight"] },
      "ai-playlists": { video: "media/ai.mp4", chips: ["Create playlist", "Find playlist", "Add tracks", "Optimize"] },
    };
    for (const [id, w] of Object.entries(want)) {
      const s = page.locator(`section#${id}`);
      await expect(s.locator(`video[src$='${w.video}']`)).toHaveCount(1);
      await expect(s.locator(".chip")).toHaveText(w.chips);
    }
  });

  test("every media sits in a frame with the edge light", async ({ page }) => {
    await page.goto("/");
    const media = await page.locator("main video, main [data-take] img").count();
    expect(media).toBeGreaterThanOrEqual(8);
    // ogni video o immagine della home ha una cornice accesa come antenato, con l'anello e l'alone
    const unlit = await page.locator("main video, main [data-take] img").evaluateAll((els) =>
      els.filter((e) => !e.closest("[data-edge-light] .lf__screen")).length,
    );
    expect(unlit).toBe(0);
    const frames = page.locator(".lf[data-edge-light]");
    expect(await frames.count()).toBe(media);
    for (const f of await frames.all()) {
      await expect(f.locator(".lf__rim")).toHaveCount(1);
      await expect(f.locator(".lf__halo")).toHaveCount(1);
      const c1 = await f.evaluate((e) => getComputedStyle(e).getPropertyValue("--c1").trim());
      expect(c1).toMatch(/^#[0-9a-f]{6}$/i);
      // il verde e' delle azioni, mai della luce attorno ai media
      expect(c1.toLowerCase()).not.toBe("#1db954");
    }
    // la luce si accende entrando: il primo media in alto e' gia' acceso, quelli in fondo no
    await expect.poll(() => page.locator("#top .lf__rim").evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1);
    // spenta = sotto il 2%: al caricamento l'anello può essere ancora in coda alla transizione (0.00001 visto)
    await expect.poll(() => page.locator("#search .lf__rim").evaluate((e) => Number(getComputedStyle(e).opacity))).toBeLessThan(0.02);
  });

  test("the platforms row shows the real logos from simple-icons, in brand colors", async ({ page }) => {
    await page.goto("/");
    const w = page.locator("#works-with");
    for (const name of ["Spotify", "Apple Music", "YouTube Music", "SoundCloud", "Mac", "Windows"]) {
      await expect(w.getByRole("heading", { name, exact: true })).toBeVisible();
      await expect(w.getByRole("img", { name: `${name} logo` })).toBeVisible();
    }
    await expect(w).toContainText("app you already use");
    // il cerchio di Spotify di simple-icons, nel verde del marchio
    const spotify = w.getByRole("img", { name: "Spotify logo" });
    await expect(spotify.locator('path[d^="M12 0C5.4"]')).toHaveCount(1);
    expect(await spotify.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(30, 215, 96)");
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

  test("smooth scrolling (Lenis) is on with a mouse and normal motion", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\blenis\b/);
    expect(await page.evaluate(() => typeof (window as unknown as { __lenis?: unknown }).__lenis)).toBe("object");
  });

  test("with reduced motion nothing waits to appear and nothing plays by itself", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    // niente Lenis: lo scorrimento resta quello del sistema
    await expect(page.locator("html")).not.toHaveClass(/\blenis\b/);
    expect(await page.evaluate(() => typeof (window as unknown as { __lenis?: unknown }).__lenis)).toBe("undefined");
    // titoli interi, senza parole nascoste, e la luce gia' accesa e ferma
    expect(await page.locator("#pricing h2 .w").count()).toBe(0);
    expect(await page.locator("#search .lf__rim").evaluate((e) => getComputedStyle(e, "::before").animationName)).toBe("none");
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
