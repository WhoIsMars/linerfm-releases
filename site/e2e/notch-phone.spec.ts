import { test, expect, devices } from "@playwright/test";

// 25/10, owner da iPhone: "la notch non si vede nel video perché lo spazio è troppo piccolo".
// Il video era un quadrato di 276 px con la notch in alto; ora è una striscia larga quanto la
// sezione, così il pannello della notch occupa tutta la larghezza del telefono.
test.use({ ...devices["iPhone 13"], browserName: "webkit" });

test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test("on an iPhone the notch video spans the section and is a wide strip", async ({ page }) => {
  await page.goto("/");
  const video = page.locator("#notch video");
  await video.evaluate((v) => v.scrollIntoView({ block: "center" }));
  const box = (await video.boundingBox())!;
  // la cornice prende tutta la larghezza utile della sezione (prima il quadrato era 276 px su 390)
  const r = await page.locator("#notch figure[data-take]").evaluate((f) => {
    const p = f.parentElement!, cs = getComputedStyle(p);
    return { fig: f.getBoundingClientRect().width, wrap: p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
  });
  expect(r.fig).toBeGreaterThanOrEqual(r.wrap - 2);
  expect(box.width).toBeGreaterThan(300);
  expect(box.width / box.height).toBeGreaterThan(2);
});
