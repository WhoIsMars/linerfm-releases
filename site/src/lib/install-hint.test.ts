import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InstallHint, { hintFor } from "../components/InstallHint";

// Piano crescita 2026-10: chi scarica e non apre l'app si perde al primo avvio.
// Subito dopo il click, accanto ai pulsanti, i passi per superare SmartScreen o Gatekeeper.
const html = (arch: string) => renderToStaticMarkup(createElement(InstallHint, { arch }));

describe("hintFor", () => {
  it("both Mac builds get the Gatekeeper hint, Windows the SmartScreen one", () => {
    expect(hintFor("apple-silicon")).toBe("mac");
    expect(hintFor("intel")).toBe("mac");
    expect(hintFor("windows")).toBe("windows");
  });

  it("nothing before a click, nothing for the GitHub fallback", () => {
    expect(hintFor(null)).toBeNull();
    expect(hintFor("github-page")).toBeNull();
  });
});

describe("InstallHint", () => {
  it("Windows: the two SmartScreen steps in order, and no admin rights", () => {
    const h = html("windows");
    expect(h).toContain("More info");
    expect(h).toContain("Run anyway");
    expect(h.indexOf("More info")).toBeLessThan(h.indexOf("Run anyway"));
    expect(h).toContain("installs for your user only, no admin rights needed");
  });

  it("Mac: the Gatekeeper Open Anyway step", () => {
    const h = html("intel");
    expect(h).toContain("Privacy &amp; Security");
    expect(h).toContain("Open Anyway");
    expect(h).not.toContain("Run anyway");
  });

  it("is announced to screen readers when it appears", () => {
    expect(html("windows")).toMatch(/role="status"/);
  });

  it("renders nothing before a download click", () => {
    expect(html("")).toBe("");
  });

  it("copy has no em dashes or double hyphens", () => {
    for (const a of ["windows", "apple-silicon"]) expect(html(a)).not.toMatch(/—|--/);
  });
});
