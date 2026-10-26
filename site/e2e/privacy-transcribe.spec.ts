import { test, expect } from "@playwright/test";

// 25/10, prima della 1.2.5: "Write missing lyrics" manda pezzi di audio del player al nostro server
// e a Groq. Ogni frase viene dal codice dell'app: worker/src/transcribe.ts (pezzi, contatore per
// dispositivo con TTL 2 giorni, prompt "artista - titolo"), src-tauri/src/transcribe.rs:368,
// Settings.tsx:613-647 (pannello General, accesa di serie).
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
});

test("the privacy page says what Write missing lyrics sends, to whom, what is kept and how to turn it off", async ({ page }) => {
  await page.goto("/privacy/");
  const s = page.locator("#lyrics-from-audio");
  await expect(s.getByRole("heading", { level: 2 })).toHaveText("Lyrics written from the audio");
  const text = (await s.innerText()).replace(/\s+/g, " ");
  for (const fact of [
    "Write missing lyrics",
    "on by default",
    "Settings, General",
    "about 25 seconds",
    "artist and title",
    "everything the browser is playing",
    "Groq",
    "does not keep the audio",
    "deleted after 2 days",
    "only on your computer",
  ]) expect(text, fact).toContain(fact);
  await expect(s.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "https://groq.com/privacy-policy/");
  // l'elenco "The app" non può più dire che nulla lascia il computer senza eccezioni
  await expect(page.getByText("Your listening history and playlist data never leave your machine.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Last updated: 2026-10-26", { exact: false })).toBeVisible();
});
