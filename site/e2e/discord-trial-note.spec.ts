import { test, expect } from "@playwright/test";

// 28/10/2026 (owner, "più visibile"): dalla 1.3.0 la prova chiede Discord, ma la FAQ e' chiusa e in
// fondo. Sotto il pulsante di download una riga lo dice prima di scaricare, e porta alla risposta aperta.
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test("under the download button, a visible line says the trial needs a free Discord account", async ({ page }) => {
  await page.goto("/");
  const note = page.locator("#download [data-discord-note]");
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeVisible();
  await expect(note).toContainText("free Discord account");
});

test("its link opens the Discord answer in the FAQ", async ({ page }) => {
  await page.goto("/");
  const faq = page.locator('#faq details[data-faq="discord"]');
  await expect(faq).not.toHaveAttribute("open", "");
  await page.locator("#download [data-discord-note]").getByRole("link", { name: "How it works" }).click();
  await expect(faq).toHaveAttribute("open", "");
});
