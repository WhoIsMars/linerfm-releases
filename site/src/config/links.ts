// Shared external links and identifiers for the LinerFM landing.
// Single source of truth — update here, not in components.

/** Lemon Squeezy checkout. `?embed=1` makes lemon.js open it as an overlay. */
export const CHECKOUT_URL =
  "https://linerfm.lemonsqueezy.com/checkout/buy/df7c9dab-84b4-49ee-a973-31aaaf42d369?embed=1";

/** Community Discord (invito permanente, canale supporto/annunci). */
export const DISCORD_URL = "https://discord.gg/vhU22mKHAr";

/** Public binaries repo (GitHub Releases + this site). */
export const REPO_URL = "https://github.com/WhoIsMars/linerfm-releases";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const RELEASES_LATEST_URL = `${REPO_URL}/releases/latest`;

/** GitHub API endpoint for the latest release (anonymous, public). */
export const RELEASES_API_URL =
  "https://api.github.com/repos/WhoIsMars/linerfm-releases/releases/latest";
