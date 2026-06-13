import { describe, it, expect } from "vitest";
import { pickDmgAsset, formatBytes, type GithubRelease } from "./release";

const release: GithubRelease = {
  tag_name: "v0.5.3",
  html_url: "https://github.com/WhoIsMars/linerfm-releases/releases/tag/v0.5.3",
  assets: [
    { name: "latest.json", size: 823, browser_download_url: "https://x/latest.json" },
    { name: "LinerFM.app.tar.gz", size: 33388982, browser_download_url: "https://x/app.tar.gz" },
    { name: "LinerFM_0.5.3_aarch64.dmg", size: 33666536, browser_download_url: "https://x/LinerFM_0.5.3_aarch64.dmg" },
  ],
};

describe("pickDmgAsset", () => {
  it("selects the aarch64 dmg with version and url", () => {
    const r = pickDmgAsset(release);
    expect(r).toEqual({
      version: "0.5.3",
      url: "https://x/LinerFM_0.5.3_aarch64.dmg",
      size: 33666536,
      pageUrl: "https://github.com/WhoIsMars/linerfm-releases/releases/tag/v0.5.3",
    });
  });

  it("returns null when no dmg asset is present", () => {
    expect(pickDmgAsset({ ...release, assets: [release.assets[0]] })).toBeNull();
  });

  it("strips a leading v from the tag", () => {
    expect(pickDmgAsset(release)?.version).toBe("0.5.3");
  });

  it("prefers the aarch64 dmg over a generic dmg regardless of order", () => {
    const r = pickDmgAsset({
      ...release,
      assets: [
        { name: "LinerFM_0.5.3_universal.dmg", size: 1, browser_download_url: "https://x/universal.dmg" },
        { name: "LinerFM_0.5.3_aarch64.dmg", size: 2, browser_download_url: "https://x/aarch64.dmg" },
      ],
    });
    expect(r?.url).toBe("https://x/aarch64.dmg");
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
