import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Il sito sta su GitHub Pages: /privacy risponde 301 verso /privacy/, e Search Console
// segnala come "pagina con reindirizzamento" ogni link interno senza barra finale (26/10/2026).
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(astro|tsx)$/.test(name) ? [p] : [];
  });
}

describe("link interni", () => {
  it("ogni pagina linkata con base finisce con la barra", () => {
    const bad: string[] = [];
    for (const file of sources(join(__dirname, ".."))) {
      for (const [, path] of readFileSync(file, "utf8").matchAll(/\$\{base\}([a-z0-9/._-]+)/g)) {
        // file (favicon-32.png) e pagine con la barra vanno bene
        if (!path.endsWith("/") && !/\.[a-z0-9]+$/.test(path)) bad.push(`${file}: ${path}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
