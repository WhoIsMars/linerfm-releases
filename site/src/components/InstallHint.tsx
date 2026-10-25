// Mostrato accanto ai pulsanti appena parte il download: chi non supera SmartScreen o
// Gatekeeper al primo avvio non apre mai l'app (piano crescita 2026-10). Testi presi da
// Download.astro, dove restano i passi completi con gli screenshot. Dal 25/10 sotto c'è l'invito
// su Discord: chi ha appena scaricato è chi più probabilmente ha una domanda.
import { DISCORD_URL } from "../config/links";

export function hintFor(arch: string | null): "mac" | "windows" | null {
  if (arch === "windows") return "windows";
  if (arch === "apple-silicon" || arch === "intel") return "mac";
  return null;
}

export default function InstallHint({ arch }: { arch: string | null }) {
  const kind = hintFor(arch);
  if (!kind) return null;
  return (
    <div role="status" className="panel w-full max-w-md p-4 text-left text-sm text-fg-2">
      {kind === "windows" ? (
        <>
          <p className="font-semibold text-fg">If Windows says it protected your PC:</p>
          <ol className="mt-2 space-y-1 list-decimal list-inside">
            <li>Click "More info".</li>
            <li>Click "Run anyway".</li>
          </ol>
          <p className="mt-2 text-xs text-fg-3">It installs for your user only, no admin rights needed.</p>
        </>
      ) : (
        <>
          <p className="font-semibold text-fg">If macOS blocks the first launch:</p>
          <p className="mt-2">Go to System Settings → Privacy &amp; Security and click "Open Anyway".</p>
          <p className="mt-2 text-xs text-fg-3">
            Steps with screenshots <a href="#first-launch-mac" className="underline">below</a>.
          </p>
        </>
      )}
      <p className="mt-3 pt-3 border-t border-hairline text-xs text-fg-3">
        Stuck, or want to see what's next? Ask in #support on <a href={DISCORD_URL} data-discord="hint" className="underline text-fg-2 hover:text-fg">Discord</a>.
      </p>
    </div>
  );
}
