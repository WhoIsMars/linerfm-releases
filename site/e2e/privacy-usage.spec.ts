import { test, expect } from "@playwright/test";

// 26/10, per la 1.2.8: il controllo licenza orario e i report dall'app dicono chi usa LinerFM.
// Ogni frase viene dal codice: linerfm src-tauri/src/usage.rs (campi mandati), license/client.rs
// check_now (una volta all'ora), feedback.rs who (8 caratteri dell'hash); worker/src/devices.ts
// (giorno di prova calcolato dal server, account Discord dal legame della licenza, niente IP).
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
});

test("the privacy page lists what the license check sends, why, and what is never sent", async ({ page }) => {
  await page.goto("/privacy/");
  const s = page.locator("#license-check");
  await expect(s.getByRole("heading", { level: 2 })).toHaveText("What the app tells our server");
  const text = (await s.innerText()).replace(/\s+/g, " ");
  for (const fact of [
    "once an hour",
    "first 8 characters",
    "app version",
    "system version",
    "processor type",
    "language",
    "which music players",
    "never what you listen to",
    "how many times",
    "first opened",
    "day of the trial",
    "country",
    "Discord account",
    "bug report",
    "not your IP address",
    "no email",
    "delete",
  ]) expect(text, fact).toContain(fact);
  // non è più vero: l'app manda dati d'uso
  await expect(page.getByText("The app sends no telemetry and no usage data.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Last updated: 2026-10-26", { exact: false })).toBeVisible();
});
