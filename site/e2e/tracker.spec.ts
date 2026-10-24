import { expect, test } from "@playwright/test";

// Metricool legge le visite del sito accanto ai social (owner, 24/10/2026): il tracker
// sta nell'head di ogni pagina, con l'hash del brand "linerfm".
const HASH = "a870b2b3705cba7bc947b520ecc38ca9";

test("ogni pagina carica il tracker di Metricool con l'hash del brand", async ({ page }) => {
  for (const path of ["/", "/windows"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    const html = await page.content();
    expect(html).toContain("https://tracker.metricool.com/resources/be.js");
    expect(html).toContain(HASH);
  }
});
