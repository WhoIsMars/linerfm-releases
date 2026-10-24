import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mediaSize } from "./media-dimensions";

// Ogni video in public/video e public/media deve avere le sue dimensioni censite: senza, la
// pagina non dichiara width e height e il layout salta quando il file arriva.
const dir = (d: string) => fileURLToPath(new URL(`../../public/${d}/`, import.meta.url));
const mp4s = ["video", "media"].flatMap((d) => readdirSync(dir(d)).filter((f) => f.endsWith(".mp4")).map((f) => `${d}/${f}`));

// Larghezza e altezza della traccia video, dal box "tkhd" dell'mp4 (16.16 a virgola fissa negli
// ultimi 8 byte del box): niente ffprobe, così il test gira ovunque.
function trackSize(file: string): { width: number; height: number } {
  const buf = readFileSync(fileURLToPath(new URL(`../../public/${file}`, import.meta.url)));
  for (let i = buf.indexOf("tkhd"); i > 0; i = buf.indexOf("tkhd", i + 4)) {
    const end = i - 4 + buf.readUInt32BE(i - 4);
    const width = Math.round(buf.readUInt32BE(end - 8) / 65536), height = Math.round(buf.readUInt32BE(end - 4) / 65536);
    if (width > 0 && height > 0) return { width, height };
  }
  throw new Error(`no video track in ${file}`);
}

describe("mediaSize", () => {
  it.each(mp4s)("knows the size of %s", (file) => {
    const size = mediaSize(file);
    expect(size?.width).toBeGreaterThan(0);
    expect(size?.height).toBeGreaterThan(0);
  });

  // Un video ritagliato con le misure vecchie: la cornice avrebbe il rapporto sbagliato.
  // Tolleranza di 1 px: ai.mp4 ha pixel appena non quadrati (2431:2432), 1279,47 px a schermo.
  it.each(mp4s)("declares the real size of %s", (file) => {
    const real = trackSize(file), size = mediaSize(file);
    expect(Math.abs((size?.width ?? 0) - real.width), `width ${size?.width} vs ${real.width}`).toBeLessThanOrEqual(1);
    expect(Math.abs((size?.height ?? 0) - real.height), `height ${size?.height} vs ${real.height}`).toBeLessThanOrEqual(1);
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
