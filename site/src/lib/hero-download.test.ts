import { describe, it, expect } from "vitest";
import { heroChoice } from "./hero-download";
import type { DmgInfo, MacDmgs } from "./release";

// Conversione 21/10: 46 persone su 50 non cliccano nulla e chi scarica lo fa in 6-64 secondi.
// Il pulsante dell'hero deve scaricare subito la build giusta per il computer di chi guarda,
// con le altre due come righe piccole sotto.
const info = (name: string): DmgInfo => ({ version: "1.1.1", url: `https://x/${name}`, size: 33 * 1024 * 1024, pageUrl: "https://x/rel" });
const dmgs: MacDmgs = { appleSilicon: info("aarch64.dmg"), intel: info("x64.dmg") };
const exe = info("x64-setup.exe");

describe("heroChoice", () => {
  it("on a Mac the primary is Apple Silicon, Intel and Windows below", () => {
    const c = heroChoice(false, dmgs, exe);
    expect(c.primary).toEqual({ label: "Download for Mac", arch: "apple-silicon", info: dmgs.appleSilicon });
    expect(c.others.map((o) => o.arch)).toEqual(["intel", "windows"]);
  });

  it("on Windows the primary is the installer, both Macs below", () => {
    const c = heroChoice(true, dmgs, exe);
    expect(c.primary).toEqual({ label: "Download for Windows", arch: "windows", info: exe });
    expect(c.others.map((o) => o.arch)).toEqual(["apple-silicon", "intel"]);
  });

  it("on Windows without an installer falls back to the Mac build", () => {
    const c = heroChoice(true, dmgs, null);
    expect(c.primary.arch).toBe("apple-silicon");
    expect(c.others.map((o) => o.arch)).toEqual(["intel"]);
  });

  it("a release missing a Mac build still offers what exists", () => {
    const c = heroChoice(false, { appleSilicon: null, intel: dmgs.intel }, exe);
    expect(c.primary.arch).toBe("intel");
    expect(c.others.map((o) => o.arch)).toEqual(["windows"]);
  });
});
