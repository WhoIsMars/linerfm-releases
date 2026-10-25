import { describe, it, expect } from "vitest";
// @ts-expect-error script .mjs senza tipi
import { digest, mailto, SUBJECT, BODY, unsentQuery } from "../scripts/leads.mjs";
import { LINK_SUBJECT, LINK_TEXT } from "../src/lead";

const rows = [
  { ts: Date.UTC(2026, 9, 21, 15, 0), email: "a@example.com", src: "tiktok", country: "IT" },
  { ts: Date.UTC(2026, 9, 21, 16, 30), email: "b@example.com", src: "", country: "US" },
];

describe("leads.mjs", () => {
  it("digest: title with the count, one line per email in Rome time with its source", () => {
    const [title, ...lines] = digest(rows).split("\n");
    expect(title).toBe("2 email da telefono da mandare");
    expect(lines.join("\n")).toContain("21/10 17:00 · a@example.com · tiktok · IT");
    expect(lines.join("\n")).toContain("21/10 18:30 · b@example.com · diretto · US");
    expect(digest([])).toBe("Nessuna email da telefono nel periodo");
  });

  it("mailto: address, subject and body with the download link, encoded", () => {
    const m = mailto("a+x@example.com");
    expect(m.startsWith("mailto:a%2Bx%40example.com?subject=")).toBe(true);
    expect(decodeURIComponent(m)).toContain("https://linerfm.xyz/?src=email#download");
    expect(decodeURIComponent(m)).not.toMatch(/—/);
  });

  // 25/10: il link parte da solo con Resend; a mano restano solo gli indirizzi dove non è partito.
  it("the manual mail is the same as the automatic one", () => {
    expect(SUBJECT).toBe(LINK_SUBJECT);
    expect(BODY).toBe(LINK_TEXT);
  });

  it("lists only the addresses the automatic send did not reach", () => {
    expect(unsentQuery(1000)).toBe("SELECT ts, email, src, country FROM leads WHERE ts > 1000 AND sent_ts IS NULL ORDER BY ts");
  });
});
