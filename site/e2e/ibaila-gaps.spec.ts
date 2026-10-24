import { test, expect } from "@playwright/test";

// 23/10, dal confronto con aestheticmac.com (research/2026-10-23-sito-vs-ibaila.md):
// tre cose che mancavano e che non richiedono materiale nuovo.
// Le frasi su permessi e microfono sono verificate nel codice dell'app (vedi i commenti in Faq.astro).
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api.github.com/**", (r) => r.fulfill({ status: 503 }));
});

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("the FAQ answers the fears that stop a download", () => {
  const answer = (page: import("@playwright/test").Page, id: string) => page.locator(`#faq details[data-faq="${id}"]`);

  test("microphone, permissions and power come right after the three warnings", async ({ page }) => {
    await page.goto("/");
    const ids = await page.locator("#faq details").evaluateAll((ds) => ds.map((d) => (d as HTMLElement).dataset.faq ?? ""));
    expect(ids.slice(0, 6)).toEqual(["safe", "warning-mac", "warning-windows", "microphone", "permissions", "power"]);
  });

  test("the microphone answer says never, and what it listens to instead", async ({ page }) => {
    await page.goto("/");
    const d = answer(page, "microphone");
    await expect(d.locator("summary")).toContainText("microphone");
    await expect(d.locator("p")).toContainText("never asks for the microphone");
    await expect(d.locator("p")).toContainText("Nothing is recorded");
  });

  test("the permissions answer names Automation, Audio and Accessibility, and when each appears", async ({ page }) => {
    await page.goto("/");
    const p = answer(page, "permissions").locator("p");
    for (const word of ["Automation", "Audio", "Accessibility", "Reacts to music", "Volume HUD"]) {
      await expect(p).toContainText(word);
    }
  });

  test("the power answer gives what the app does, not a number nobody measured", async ({ page }) => {
    await page.goto("/");
    const p = answer(page, "power").locator("p");
    await expect(p).toContainText("Low Power Mode");
    await expect(p).toContainText("Energy saver");
    const faq = await page.locator("#faq").innerText();
    expect(faq).not.toMatch(/lighter on battery|less memory|less RAM|\d+\s?MB/i);
  });

  test("the intro says a real person answers", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#faq")).toContainText("a real person answers");
    await expect(page.locator("#faq").getByRole("link", { name: "Discord" })).toBeVisible();
  });
});

test.describe("pricing is four clear rows, the trial first", () => {
  test("four rows, in this order", async ({ page }) => {
    await page.goto("/");
    const rows = page.locator("#pricing ul > li");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("5 days free, no card");
    await expect(rows.nth(1)).toContainText("10€ once, no subscription");
    await expect(rows.nth(2)).toContainText("Mac or Windows");
    await expect(rows.nth(3)).toContainText("no account, no telemetry");
  });

  test("the trial is said once, in a row, not again under the button", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("#pricing").innerText();
    expect(text.match(/5[- ]days? free/gi) ?? []).toHaveLength(1);
    expect(text).not.toContain("5-day free trial first");
    await expect(page.locator("#pricing")).toContainText("After the trial a license is required");
    await expect(page.locator("#pricing a.lemonsqueezy-button")).toHaveCount(1);
  });
});

// 24/10/2026: "the tour opens with the feeling" tolto con la home a schermi (niente piu' #features-tour);
// la struttura nuova e' coperta da e2e/redesign.spec.ts.
