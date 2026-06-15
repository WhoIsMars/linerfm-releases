import { useEffect, useState } from "react";
import { pickMacDmgs, formatBytes, type MacDmgs, type GithubRelease } from "../lib/release";
import { RELEASES_API_URL, RELEASES_LATEST_URL } from "../config/links";

export default function DownloadButton() {
  const [dmgs, setDmgs] = useState<MacDmgs | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(RELEASES_API_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: GithubRelease) => { if (alive) setDmgs(pickMacDmgs(data)); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) {
    return (
      <a href={RELEASES_LATEST_URL} className="btn-primary inline-flex items-center font-semibold px-7 py-3.5 rounded-xl">
        Download — latest release on GitHub
      </a>
    );
  }

  if (!dmgs) {
    return (
      <span className="btn-ghost inline-flex items-center font-semibold px-7 py-3.5 rounded-xl opacity-70">
        Loading latest version…
      </span>
    );
  }

  const Btn = ({ label, info, primary }: { label: string; info: MacDmgs["intel"]; primary?: boolean }) => {
    const href = info?.url ?? RELEASES_LATEST_URL;
    const sub = info ? `v${info.version} · ${formatBytes(info.size)}` : "Latest on GitHub";
    return (
      <a href={href} className={`${primary ? "btn-primary" : "btn-ghost"} inline-flex flex-col items-center font-semibold px-7 py-3.5 rounded-xl`}>
        <span>Download · {label}</span>
        <span className="text-xs font-normal opacity-80 mt-0.5">{sub}</span>
      </a>
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Btn label="Apple Silicon" info={dmgs.appleSilicon} primary />
      <Btn label="Intel" info={dmgs.intel} />
    </div>
  );
}
