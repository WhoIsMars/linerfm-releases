export interface GithubAsset { name: string; size: number; browser_download_url: string; }
export interface GithubRelease { tag_name: string; html_url: string; assets: GithubAsset[]; }
export interface DmgInfo { version: string; url: string; size: number; pageUrl: string; }

function toDmgInfo(release: GithubRelease, asset: GithubAsset): DmgInfo {
  return {
    version: release.tag_name.replace(/^v/, ""),
    url: asset.browser_download_url,
    size: asset.size,
    pageUrl: release.html_url,
  };
}

/**
 * The two native macOS DMGs of a release. We ship separate builds (no universal),
 * so the landing offers an explicit choice per architecture.
 */
export interface MacDmgs { appleSilicon: DmgInfo | null; intel: DmgInfo | null; }

export function pickMacDmgs(release: GithubRelease): MacDmgs {
  const byName = (re: RegExp) => {
    const a = release.assets.find((x) => re.test(x.name));
    return a ? toDmgInfo(release, a) : null;
  };
  return {
    appleSilicon: byName(/aarch64\.dmg$/i),
    intel: byName(/(x64|x86_64)\.dmg$/i),
  };
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}
