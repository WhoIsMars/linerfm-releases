import { useEffect, useState } from "react";
import { RELEASES_LIST_API_URL, RELEASES_URL } from "../config/links";

interface ReleaseEntry {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  html_url: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Release bodies are plain prose or "- " bullet lines; render just those two shapes. */
function Body({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return (
    <div className="mt-3 space-y-2 text-sm text-white/70">
      {lines.map((line, i) =>
        line.startsWith("- ") ? (
          <p key={i} className="pl-4 relative before:content-['·'] before:absolute before:left-1">{line.slice(2)}</p>
        ) : (
          <p key={i}>{line}</p>
        ),
      )}
    </div>
  );
}

export default function ChangelogList() {
  const [releases, setReleases] = useState<ReleaseEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(RELEASES_LIST_API_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: ReleaseEntry[]) => { if (alive) setReleases(data.filter((r) => r.body?.trim())); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) {
    return (
      <p className="text-white/60">
        Could not load the release feed. See every release on{" "}
        <a href={RELEASES_URL} className="text-green-400 hover:underline">GitHub</a>.
      </p>
    );
  }
  if (!releases) return <p className="text-white/40">Loading releases…</p>;

  return (
    <ol className="space-y-10">
      {releases.map((r) => (
        <li key={r.tag_name} className="border-l-2 border-green-500/30 pl-5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-lg font-semibold">
              <a href={r.html_url} className="hover:text-green-400">{r.tag_name}</a>
            </h2>
            <time dateTime={r.published_at} className="text-xs text-white/40">{formatDate(r.published_at)}</time>
          </div>
          <Body text={r.body} />
        </li>
      ))}
    </ol>
  );
}
