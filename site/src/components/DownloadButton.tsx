import { useEffect, useState } from "react";
import { pickDmgAsset, formatBytes, type DmgInfo, type GithubRelease } from "../lib/release";
import { RELEASES_API_URL, RELEASES_LATEST_URL } from "../config/links";

export default function DownloadButton() {
  const [info, setInfo] = useState<DmgInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(RELEASES_API_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: GithubRelease) => { if (alive) setInfo(pickDmgAsset(data)); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const href = info?.url ?? RELEASES_LATEST_URL;
  const sub = info
    ? `v${info.version} · ${formatBytes(info.size)} · Intel & Apple Silicon`
    : failed
    ? "Latest release on GitHub · Intel & Apple Silicon"
    : "Loading latest version…";

  return (
    <a href={href} className="btn-primary inline-flex flex-col items-center font-semibold px-7 py-3.5 rounded-xl">
      <span>Download .dmg</span>
      <span className="text-xs font-normal opacity-80 mt-0.5">{sub}</span>
    </a>
  );
}
