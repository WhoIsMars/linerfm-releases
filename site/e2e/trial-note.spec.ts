import { test, expect } from "@playwright/test";

// 10/11/2026, con la 1.5.0: la prova parte da sola (3 giorni, niente account), Discord aggiunge 2
// giorni e un post su TikTok o Instagram altri 2, assegnati a mano in un ticket (app: worker/src/handlers.ts
// handleTrial, discord.ts /bonus). Sotto il pulsante di download una riga lo dice e porta alla risposta aperta.
// Prima (28/10, 1.3.0) la riga diceva che la prova chiedeva Discord.
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test("under the download button, a visible line says the trial starts on its own and how to make it longer", async ({ page }) => {
  await page.goto("/");
  const note = page.locator("#download [data-trial-note]");
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeVisible();
  await expect(note).toContainText("3 days");
  await expect(note).toContainText("no account");
  await expect(note).toContainText("Link Discord in the app for 2 more");
  await expect(note).not.toContainText("starts when you link");
});

test("its link opens the trial answer in the FAQ", async ({ page }) => {
  await page.goto("/");
  const faq = page.locator('#faq details[data-faq="trial"]');
  await expect(faq).not.toHaveAttribute("open", "");
  await page.locator("#download [data-trial-note]").getByRole("link", { name: "How it works" }).click();
  await expect(faq).toHaveAttribute("open", "");
});

test("no page still says the trial is 5 days or needs Discord to start", async ({ page }) => {
  for (const path of ["/", "/windows/", "/notch/", "/lyrics/", "/vs/boring-notch/", "/vs/notchnook/", "/vs/rainmeter/"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/5[- ]days?/i);
    expect(text, path).not.toMatch(/with (your )?Discord account/i);
    expect(text, path).toMatch(/up to 7 days/i);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc ?? "", path).not.toMatch(/5 days/);
  }
});
