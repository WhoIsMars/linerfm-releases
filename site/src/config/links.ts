// Shared external links and identifiers for the LinerFM landing.
// Single source of truth — update here, not in components.

/** Lemon Squeezy checkout. `?embed=1` makes lemon.js open it as an overlay. */
export const CHECKOUT_URL =
  "https://linerfm.lemonsqueezy.com/checkout/buy/70b5030a-aef8-4f1a-8d26-5e31330e1d83?embed=1";

/** Community Discord (invito permanente, canale supporto/annunci). */
export const DISCORD_URL = "https://discord.gg/vhU22mKHAr";

/** X profile (@Liner_FM). */
export const X_URL = "https://x.com/Liner_FM";

/** Instagram profile (@linerfm), where the feature Reels live. */
export const INSTAGRAM_URL = "https://www.instagram.com/linerfm/";

/** TikTok profile (@liner_fm). The bio link is not clickable there, so the site is where people land by typing. */
export const TIKTOK_URL = "https://www.tiktok.com/@liner_fm";

/** YouTube channel (@liner_fm): Shorts and the horizontal videos. */
export const YOUTUBE_URL = "https://www.youtube.com/@liner_fm";

/** The five public profiles, in the order they are listed on the page. */
export const SOCIAL_LINKS: { name: string; href: string }[] = [
  { name: "Discord", href: DISCORD_URL },
  { name: "TikTok", href: TIKTOK_URL },
  { name: "Instagram", href: INSTAGRAM_URL },
  { name: "YouTube", href: YOUTUBE_URL },
  { name: "X", href: X_URL },
];

/** Public binaries repo (GitHub Releases + this site). */
export const REPO_URL = "https://github.com/WhoIsMars/linerfm-releases";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const RELEASES_LATEST_URL = `${REPO_URL}/releases/latest`;

/** GitHub API endpoint for the latest release (anonymous, public). */
export const RELEASES_API_URL =
  "https://api.github.com/repos/WhoIsMars/linerfm-releases/releases/latest";

/** GitHub API endpoint for the release list (What's new page). */
export const RELEASES_LIST_API_URL =
  "https://api.github.com/repos/WhoIsMars/linerfm-releases/releases?per_page=15";

/** Stats worker (`stats/` in this repo): counts visits and DMG clicks, no cookies. */
export const STATS_URL = "https://linerfm-site-stats.piccoletto.workers.dev/hit";

/** Same worker: an email left from a phone to get the download link (stats/src/lead.ts). */
export const LEAD_URL = "https://linerfm-site-stats.piccoletto.workers.dev/lead";
