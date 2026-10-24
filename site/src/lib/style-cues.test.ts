import { describe, expect, it } from "vitest";
import { activeCue } from "./style-cues";

const WIDGET = [
  { label: "Glass", at: 0 },
  { label: "Cinematic", at: 1.57 },
  { label: "Minimal", at: 2.95 },
  { label: "Compact", at: 4.28 },
  { label: "Terminal", at: 5.58 },
  { label: "Glass", at: 6.97 },
];

describe("activeCue", () => {
  it("picks the last cue that has started", () => {
    expect(activeCue(WIDGET, 0)).toBe("Glass");
    expect(activeCue(WIDGET, 1.57)).toBe("Cinematic");
    expect(activeCue(WIDGET, 4.8)).toBe("Compact");
    expect(activeCue(WIDGET, 6.5)).toBe("Terminal");
  });

  it("wraps back to the look the loop ends on", () => {
    expect(activeCue(WIDGET, 8.4)).toBe("Glass");
  });

  it("accepts cues out of order", () => {
    expect(activeCue([{ label: "B", at: 2 }, { label: "A", at: 0 }], 2.5)).toBe("B");
  });

  it("returns undefined with no cues or before the first one", () => {
    expect(activeCue([], 3)).toBeUndefined();
    expect(activeCue([{ label: "A", at: 1 }], 0.5)).toBeUndefined();
    expect(activeCue(WIDGET, Number.NaN)).toBeUndefined();
  });
});
