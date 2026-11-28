// IndexNow (28/11/2026): a ogni pubblicazione il sito dice a Bing (che serve anche DuckDuckGo,
// Yahoo ed Ecosia), Yandex, Seznam e Naver quali pagine ci sono, senza account. La chiave è
// pubblica per costruzione: i motori la verificano scaricando public/<chiave>.txt.
export const INDEXNOW_KEY = "489d0fabb87d231f2cf543e8f8ed0f5a";

/** Il corpo della richiesta a https://api.indexnow.org/indexnow dalle <loc> della sitemap. */
export function indexNowPayload(sitemapXml, site) {
  const { host, origin } = new URL(site);
  const urlList = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => new URL(u).host === host);
  return { host, key: INDEXNOW_KEY, keyLocation: `${origin}/${INDEXNOW_KEY}.txt`, urlList };
}
