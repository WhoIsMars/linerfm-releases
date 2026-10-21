import { describe, it, expect } from "vitest";
import { pickMacDmgs, pickWindowsExe, formatBytes, type GithubRelease } from "./release";

const release: GithubRelease = {
  tag_name: "v0.6.0",
  html_url: "https://github.com/WhoIsMars/linerfm-releases/releases/tag/v0.6.0",
  assets: [
    { name: "latest.json", size: 800, browser_download_url: "https://x/latest.json" },
    { name: "LinerFM_aarch64.app.tar.gz", size: 100, browser_download_url: "https://x/arm.tar.gz" },
    { name: "LinerFM_0.6.0_aarch64.dmg", size: 31000000, browser_download_url: "https://x/LinerFM_0.6.0_aarch64.dmg" },
    { name: "LinerFM_0.6.0_x64.dmg", size: 33000000, browser_download_url: "https://x/LinerFM_0.6.0_x64.dmg" },
  ],
};

describe("pickMacDmgs", () => {
  it("returns the Apple Silicon and Intel dmgs with version/url/size", () => {
    const r = pickMacDmgs(release);
    expect(r.appleSilicon).toEqual({
      version: "0.6.0",
      url: "https://x/LinerFM_0.6.0_aarch64.dmg",
      size: 31000000,
      pageUrl: "https://github.com/WhoIsMars/linerfm-releases/releases/tag/v0.6.0",
    });
    expect(r.intel).toEqual({
      version: "0.6.0",
      url: "https://x/LinerFM_0.6.0_x64.dmg",
      size: 33000000,
      pageUrl: "https://github.com/WhoIsMars/linerfm-releases/releases/tag/v0.6.0",
    });
  });

  it("does not confuse the aarch64 dmg for the Intel one", () => {
    const r = pickMacDmgs(release);
    expect(r.intel?.url).toBe("https://x/LinerFM_0.6.0_x64.dmg");
    expect(r.appleSilicon?.url).not.toContain("x64");
  });

  it("matches an x86_64-named dmg as Intel too", () => {
    const r = pickMacDmgs({
      ...release,
      assets: [{ name: "LinerFM_0.6.0_x86_64.dmg", size: 1, browser_download_url: "https://x/intel.dmg" }],
    });
    expect(r.intel?.url).toBe("https://x/intel.dmg");
    expect(r.appleSilicon).toBeNull();
  });

  it("returns nulls when a dmg is missing", () => {
    const r = pickMacDmgs({ ...release, assets: [release.assets[0]] });
    expect(r.appleSilicon).toBeNull();
    expect(r.intel).toBeNull();
  });

  it("strips a leading v from the tag", () => {
    expect(pickMacDmgs(release).appleSilicon?.version).toBe("0.6.0");
  });
});

describe("formatBytes", () => {
  it("formats megabytes with one decimal", () => {
    expect(formatBytes(33666536)).toBe("32.1 MB");
  });
  it("formats kilobytes", () => {
    expect(formatBytes(823)).toBe("0.8 KB");
  });
});

describe("pickWindowsExe", () => {
  const win: GithubRelease = {
    ...release,
    tag_name: "v1.0.0",
    assets: [
      ...release.assets,
      { name: "LinerFM_1.0.0_x64-setup.exe.sig", size: 400, browser_download_url: "https://x/setup.exe.sig" },
      { name: "LinerFM_1.0.0_x64-setup.exe", size: 31000000, browser_download_url: "https://x/LinerFM_1.0.0_x64-setup.exe" },
    ],
  };

  it("returns the Windows installer, not its signature", () => {
    expect(pickWindowsExe(win)?.url).toBe("https://x/LinerFM_1.0.0_x64-setup.exe");
    expect(pickWindowsExe(win)?.version).toBe("1.0.0");
  });

  it("is null for a release without a Windows build", () => {
    expect(pickWindowsExe(release)).toBeNull();
  });
});
