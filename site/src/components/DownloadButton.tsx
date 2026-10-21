import { useEffect, useState } from "react";
import { pickMacDmgs, pickWindowsExe, formatBytes, type MacDmgs, type DmgInfo, type GithubRelease } from "../lib/release";
import { RELEASES_API_URL, RELEASES_LATEST_URL } from "../config/links";
import { track } from "../lib/stats";
import InstallHint from "./InstallHint";

export default function DownloadButton() {
  const [dmgs, setDmgs] = useState<MacDmgs | null>(null);
  const [exe, setExe] = useState<DmgInfo | null>(null);
  // Chi arriva da Windows vede per primo il suo installer.
  const onWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
  const [failed, setFailed] = useState(false);
  // Build scaricata: dopo il click compaiono i passi del primo avvio per quel sistema.
  const [clicked, setClicked] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(RELEASES_API_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: GithubRelease) => { if (alive) { setDmgs(pickMacDmgs(data)); setExe(pickWindowsExe(data)); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) {
    return (
      <a href={RELEASES_LATEST_URL} onClick={() => track("download", "github-page")} className="btn-primary inline-flex items-center font-semibold px-7 py-3.5 rounded-control">
        Download the latest release on GitHub
      </a>
    );
  }

  if (!dmgs) {
    return (
      <span className="btn-ghost inline-flex items-center font-semibold px-7 py-3.5 rounded-control opacity-70">
        Loading latest version…
      </span>
    );
  }

  const Btn = ({ label, arch, info, primary }: { label: string; arch: string; info: MacDmgs["intel"]; primary?: boolean }) => {
    const href = info?.url ?? RELEASES_LATEST_URL;
    const sub = info ? `v${info.version} · ${formatBytes(info.size)}` : "Latest on GitHub";
    return (
      <a href={href} onClick={() => { track("download", arch); setClicked(arch); }} className={`${primary ? "btn-primary" : "btn-ghost"} inline-flex flex-col items-center font-semibold px-7 py-3.5 rounded-control`}>
        <span>Download · {label}</span>
        <span className="text-xs font-normal opacity-80 mt-0.5">{sub}</span>
      </a>
    );
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onWindows && exe && <Btn label="Windows" arch="windows" info={exe} primary />}
        <Btn label="Apple Silicon" arch="apple-silicon" info={dmgs.appleSilicon} primary={!onWindows || !exe} />
        <Btn label="Intel" arch="intel" info={dmgs.intel} />
        {!onWindows && exe && <Btn label="Windows" arch="windows" info={exe} />}
      </div>
      <InstallHint arch={clicked} />
    </div>
  );
}
