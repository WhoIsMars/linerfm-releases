import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mediaSize } from "./media-dimensions";

// Ogni video in public/video deve avere le sue dimensioni censite: senza, la
// pagina non dichiara width e height e il layout salta quando il file arriva.
const videoDir = fileURLToPath(new URL("../../public/video/", import.meta.url));
const mp4s = readdirSync(videoDir).filter((f) => f.endsWith(".mp4"));

describe("mediaSize", () => {
  it.each(mp4s)("knows the size of video/%s", (file) => {
    const size = mediaSize(`video/${file}`);
    expect(size?.width).toBeGreaterThan(0);
    expect(size?.height).toBeGreaterThan(0);
  });
});
