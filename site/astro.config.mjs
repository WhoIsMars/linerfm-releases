// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages project site: SITE=https://whoismars.github.io BASE=/linerfm-releases
// Apex domain liner.fm:      SITE=https://liner.fm           BASE=/
const SITE = process.env.PUBLIC_SITE_URL || "https://whoismars.github.io";
const BASE = process.env.PUBLIC_BASE_PATH || "/linerfm-releases";

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
});
