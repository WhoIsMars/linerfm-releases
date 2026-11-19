import { test, expect } from "@playwright/test";

// Dal 19/11/2026 niente prova per i computer nuovi (1.7.2): nessuna pagina deve piu' promettere giorni gratis.
// Prima (1.5.0) sotto il pulsante c'era la riga della prova a gradini 3+2+2, con il link alla FAQ.
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test("no page promises free days, and the meta description says the price", async ({ page }) => {
  for (const path of ["/", "/windows/", "/notch/", "/lyrics/", "/vs/boring-notch/", "/vs/notchnook/", "/vs/rainmeter/"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/up to 7 days|days free|free for \d|try free|download free/i);
    expect(text, path).not.toMatch(/with (your )?Discord account/i);
    expect(text, path).toMatch(/10 ?€ once/);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc ?? "", path).not.toMatch(/free trial|days free|up to 7/i);
  }
});
