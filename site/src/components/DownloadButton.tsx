import { useEffect, useState } from "react";
import { pickMacDmgs, pickWindowsExe, formatBytes, type MacDmgs, type DmgInfo, type GithubRelease } from "../lib/release";
import { RELEASES_API_URL, RELEASES_LATEST_URL } from "../config/links";
import { track } from "../lib/stats";
import InstallHint from "./InstallHint";
import { heroChoice } from "../lib/hero-download";

// compact: la versione dell'hero. Un solo pulsante pieno con la build di questo computer e le
// altre come righe piccole sotto; prima della risposta di GitHub mostra gia' un pulsante.
export default function DownloadButton({ preferWindows = false, compact = false }: { preferWindows?: boolean; compact?: boolean }) {
  const [dmgs, setDmgs] = useState<MacDmgs | null>(null);
  const [exe, setExe] = useState<DmgInfo | null>(null);
  // Chi arriva da Windows, o sta sulla pagina /windows, vede per primo l'installer Windows.
  const onWindows = preferWindows || (typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent));
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
    if (compact) {
      return (
        <a href={RELEASES_LATEST_URL} onClick={() => track("download", "github-page")} className="btn-primary inline-flex items-center font-semibold text-base px-7 py-3.5 rounded-full">
          Download free · 5 days
        </a>
      );
    }
    return (
      <span className="btn-ghost inline-flex items-center font-semibold px-7 py-3.5 rounded-control opacity-70">
        Loading latest version…
      </span>
    );
  }

  if (compact) {
    const { primary, others } = heroChoice(onWindows, dmgs, exe);
    const href = primary.info?.url ?? RELEASES_LATEST_URL;
    const sub = primary.info ? `5 days free · v${primary.info.version} · ${formatBytes(primary.info.size)}` : "5 days free · latest on GitHub";
    return (
      <div className="flex flex-col items-center gap-3">
        <a href={href} onClick={() => { track("download", primary.arch); setClicked(primary.arch); }} className="btn-primary inline-flex flex-col items-center font-semibold text-base px-7 py-3.5 rounded-full">
          <span>{primary.label}</span>
          <span className="text-xs font-normal opacity-80 mt-0.5">{sub}</span>
        </a>
        {others.length > 0 && (
          <p className="text-xs text-fg-3">
            Also for{" "}
            {others.map((o, i) => (
              <span key={o.arch}>
                {i > 0 && " · "}
                <a href={o.info?.url ?? RELEASES_LATEST_URL} onClick={() => { track("download", o.arch); setClicked(o.arch); }} className="underline underline-offset-4 hover:text-fg">{o.label}</a>
              </span>
            ))}
          </p>
        )}
        <InstallHint arch={clicked} />
      </div>
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
