import { defineConfig } from "@playwright/test";

// Browser tests of the published pages, on the Astro dev server with the live base path.
// Port 5276, not 5173: other projects on this Mac keep a vite on 5173 and Playwright would reuse it.
const PORT = Number(process.env.E2E_PORT ?? 5276);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, browserName: "chromium" },
  webServer: {
    command: `npx astro dev --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    env: { PUBLIC_BASE_PATH: "/", PUBLIC_SITE_URL: "https://linerfm.xyz" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
