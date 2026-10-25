import { test, expect, type Page } from "@playwright/test";

// 24/10, segnalato dall'owner su iPhone: la seconda parte dei titoli ("from a sentence.", "becomes a
// player.") non si vedeva, e il suo spazio vuoto spostava la prima riga fuori centro. Chromium la
// dipingeva lo stesso, Safari no: il test guarda i pixel in WebKit, non lo stile calcolato.
test.use({ browserName: "webkit", viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

/** Quota di pixel colorati (non quasi neri) nel riquadro dell'elemento. */
async function paintedShare(page: Page, selector: string) {
  const el = page.locator(selector);
  const png = await el.screenshot({ animations: "disabled" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) > 90) lit++;
    return lit / (d.length / 4);
  }, png.toString("base64"));
}

for (const id of ["notch", "ai-playlists", "search"]) {
  test(`${id}: the lit half of the title is painted in Safari`, async ({ page }) => {
    await page.goto("/");
    const h = page.locator(`#${id} h2`);
    await h.evaluate((x) => x.scrollIntoView({ block: "center" }));
    await expect(h).toHaveClass(/is-in/);
    // le parole salgono in 1 s: si aspetta che siano ferme
    await expect.poll(() => paintedShare(page, `#${id} .text-halo .w-mask:last-child`), { timeout: 5_000 }).toBeGreaterThan(0.08);
  });
}


// 25/10, sempre da iPhone: dietro ogni parola accesa Safari disegnava un rettangolo scuro (l'alone
// sulla parola dentro la maschera che la fa salire). Sotto "becomes", dove non c'e' testo, il colore
// deve essere quello dello sfondo.
test("no dark box behind the lit words in Safari", async ({ page }) => {
  await page.goto("/");
  const h = page.locator("#notch h2");
  await h.evaluate((x) => x.scrollIntoView({ block: "center" }));
  await expect(h).toHaveClass(/is-in/);
  await page.waitForTimeout(1500);
  // stessa riga, in fondo alla maschera dove non c'e' testo: dentro "becomes" e nello spazio dopo
  const masks = h.locator(".text-halo .w-mask");
  const m1 = (await masks.nth(0).boundingBox())!;
  const m2 = (await masks.nth(1).boundingBox())!;
  const y = m1.y + m1.height - 2;
  const png = await page.screenshot({ clip: { x: m1.x, y, width: m2.x - m1.x, height: 1 } });
  const [inside, gap] = await page.evaluate(async ([b64, w1, wAll]) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const k = img.width / wAll;
    const avg = (x0: number, x1: number) => { const d = ctx.getImageData(Math.round(x0 * k), 0, Math.max(1, Math.round((x1 - x0) * k)), 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
    return [avg(w1 * 0.3, w1 * 0.6), avg(w1 + 2, wAll - 2)];
  }, [png.toString("base64"), m1.width, m2.x - m1.x] as const);
  expect(Math.abs(inside - gap)).toBeLessThan(2);
});
