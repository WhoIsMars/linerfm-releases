import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { INDEXNOW_KEY, indexNowPayload } from "./indexnow.mjs";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://linerfm.xyz/</loc></url><url><loc>https://linerfm.xyz/changelog/</loc></url>
<url><loc>https://linerfm.xyz/vs/notchnook/</loc></url></urlset>`;

describe("indexNowPayload", () => {
  it("lists every page of the sitemap with the key and where the key lives", () => {
    expect(indexNowPayload(SITEMAP, "https://linerfm.xyz")).toEqual({
      host: "linerfm.xyz",
      key: INDEXNOW_KEY,
      keyLocation: `https://linerfm.xyz/${INDEXNOW_KEY}.txt`,
      urlList: ["https://linerfm.xyz/", "https://linerfm.xyz/changelog/", "https://linerfm.xyz/vs/notchnook/"],
    });
  });

  // IndexNow rifiuta tutta la richiesta se un indirizzo non è dell'host dichiarato
  it("drops pages of another host", () => {
    const xml = SITEMAP.replace("https://linerfm.xyz/changelog/", "https://whoismars.github.io/linerfm-releases/changelog/");
    expect(indexNowPayload(xml, "https://linerfm.xyz").urlList).toEqual(["https://linerfm.xyz/", "https://linerfm.xyz/vs/notchnook/"]);
  });

  it("returns no pages for an empty sitemap", () => {
    expect(indexNowPayload("<urlset></urlset>", "https://linerfm.xyz").urlList).toEqual([]);
  });
});

// Il file della chiave è quello che i motori scaricano per credere al ping: deve contenere la chiave.
describe("IndexNow key file", () => {
  it("is in public/ and holds the key", () => {
    const file = fileURLToPath(new URL(`../../public/${INDEXNOW_KEY}.txt`, import.meta.url));
    expect(readFileSync(file, "utf8").trim()).toBe(INDEXNOW_KEY);
  });
});
