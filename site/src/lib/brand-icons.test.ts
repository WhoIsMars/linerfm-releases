import { describe, it, expect } from "vitest";
import * as si from "simple-icons";
import { BRAND } from "./brand-icons";

// I loghi della riga "Works with" sono quelli di simple-icons, non disegnati a mano.
describe("BRAND", () => {
  const key = (slug: string) => `si${slug[0].toUpperCase()}${slug.slice(1)}` as keyof typeof si;
  it.each(Object.values(BRAND))("$slug matches simple-icons, path and color", (b) => {
    const icon = si[key(b.slug)] as { path: string; hex: string };
    expect(b.path.length).toBeGreaterThan(100);
    expect(b.path).toBe(icon.path);
    expect(b.hex).toBe(icon.hex);
  });
});
