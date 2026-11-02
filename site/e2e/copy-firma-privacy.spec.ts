import { test, expect } from "@playwright/test";

// 02/11/2026, testi approvati dall'owner. La firma viene da codesign sui .dmg della 1.4.2
// (Authority=LinerFM Self Signed), l'eccezione sull'audio da src-tauri/src/transcribe.rs e dalla card `local`.
test.beforeEach(async ({ page }) => {
  await page.route("**/linerfm-site-stats.piccoletto.workers.dev/**", (r) => r.fulfill({ status: 204 }));
});

const textOf = async (page: import("@playwright/test").Page) =>
  (await page.locator("body").evaluate((b) => b.textContent ?? "")).replace(/\s+/g, " ");

test("the home says how the Mac app is signed and what leaves the computer", async ({ page }) => {
  await page.goto("/");
  const text = await textOf(page);
  expect(text).toContain("It's signed with my own self-signed certificate, not an Apple one; the install steps are right below.");
  expect(text).toContain("your listening history stays on your computer, apart from audio clips for missing lyrics, which you can turn off.");
  expect(text).toContain("Runs on your computer: no account, and your listening history stays there.");
  expect(text).toContain("Our server checks your trial or license and writes lyrics no archive has, and the privacy policy lists what it receives and keeps.");
  for (const old of ["signed ad-hoc", "nothing you listen to sent to a server", "what you listen to stays there", "stores nothing on any server", "runs entirely on your computer"]) {
    expect(text, old).not.toContain(old);
  }
  await expect(page.getByRole("link", { name: "audio clips for missing lyrics" })).toHaveAttribute("href", "/privacy/#lyrics-from-audio");
});

test("the audio exception link lands on the privacy section that explains it", async ({ page }) => {
  await page.goto("/privacy/#lyrics-from-audio");
  await expect(page.locator("#lyrics-from-audio").getByRole("heading", { level: 2 })).toHaveText("Lyrics written from the audio");
});

test("the lyrics page no longer says there is no server", async ({ page }) => {
  await page.goto("/lyrics/");
  const text = await textOf(page);
  expect(text).toContain("No account: LinerFM runs on your computer.");
  expect(text).not.toContain("no server");
});

test("the Boring Notch page no longer says nothing leaves the computer", async ({ page }) => {
  await page.goto("/vs/boring-notch/");
  const text = await textOf(page);
  expect(text).toContain("no account, and your listening history stays there.");
  expect(text).not.toContain("never leaves it");
});
