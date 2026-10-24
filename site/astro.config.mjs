// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages project site: SITE=https://whoismars.github.io BASE=/linerfm-releases
// Custom domain (live):      SITE=https://linerfm.xyz        BASE=/  (set in deploy-pages.yml)
const SITE = process.env.PUBLIC_SITE_URL || "https://whoismars.github.io";
const BASE = process.env.PUBLIC_BASE_PATH || "/linerfm-releases";

export default defineConfig({
  site: SITE,
  base: BASE,
  // /tt è solo un rimando per la bio di TikTok: fuori dalla sitemap.
  integrations: [react(), sitemap({ filter: (page) => !/\/tt\/?$/.test(page) })],
  // lenis va pre-ottimizzato: scoperto a meta' caricamento, il dev server ricaricava la pagina e i test
  // in browser andavano in timeout sul primo goto.
  // assetsInlineLimit 0: gli script piccoli (video, consenso) vanno in file a parte invece che dentro
  // l'HTML, che per la home ha un tetto di 60 KB (seconda passata, 24/10/2026: era a 59,9 KB).
  vite: { plugins: [tailwindcss()], optimizeDeps: { include: ["lenis"] }, build: { assetsInlineLimit: 0 } },
});
