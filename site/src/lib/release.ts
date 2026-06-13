export interface GithubAsset { name: string; size: number; browser_download_url: string; }
export interface GithubRelease { tag_name: string; html_url: string; assets: GithubAsset[]; }
export interface DmgInfo { version: string; url: string; size: number; pageUrl: string; }

export function pickDmgAsset(release: GithubRelease): DmgInfo | null {
  const dmg = release.assets.find((a) => /_aarch64\.dmg$/i.test(a.name) || /\.dmg$/i.test(a.name));
  if (!dmg) return null;
  return {
    version: release.tag_name.replace(/^v/, ""),
    url: dmg.browser_download_url,
    size: dmg.size,
    pageUrl: release.html_url,
  };
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}
