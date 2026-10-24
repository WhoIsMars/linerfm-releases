import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mediaSize } from "./media-dimensions";

// Ogni video in public/video e public/media deve avere le sue dimensioni censite: senza, la
// pagina non dichiara width e height e il layout salta quando il file arriva.
const dir = (d: string) => fileURLToPath(new URL(`../../public/${d}/`, import.meta.url));
const mp4s = ["video", "media"].flatMap((d) => readdirSync(dir(d)).filter((f) => f.endsWith(".mp4")).map((f) => `${d}/${f}`));

describe("mediaSize", () => {
  it.each(mp4s)("knows the size of %s", (file) => {
    const size = mediaSize(file);
    expect(size?.width).toBeGreaterThan(0);
    expect(size?.height).toBeGreaterThan(0);
  });
});

// Le riprese della home (24/10/2026): tetto di 6 MB per tutta la cartella, video, poster e immagini.
describe("public/media", () => {
  it("stays under 6 MB in total", () => {
    const total = readdirSync(dir("media")).reduce((sum, f) => sum + statSync(dir("media") + f).size, 0);
    console.log(`public/media: ${(total / 1e6).toFixed(2)} MB`);
    expect(total).toBeLessThan(6_000_000);
  });
});
