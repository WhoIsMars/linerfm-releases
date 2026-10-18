import { describe, it, expect } from "vitest";
import {
  readConsent, writeConsent, clearTracking, ttclidFrom, readCookie, checkoutUrl, purchaseFromCheckout,
  type KV,
} from "./tt-consent";

function mem(initial: Record<string, string> = {}): KV & { m: Map<string, string> } {
  const m = new Map(Object.entries(initial));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const CHECKOUT = "https://linerfm.lemonsqueezy.com/checkout/buy/70b5030a?embed=1";

describe("scelta sul consenso", () => {
  it("nessuna scelta finché l'utente non risponde", () => {
    expect(readConsent(mem())).toBeNull();
  });
  it("ricorda accetta e rifiuta", () => {
    const s = mem();
    writeConsent(s, "granted");
    expect(readConsent(s)).toBe("granted");
    writeConsent(s, "denied");
    expect(readConsent(s)).toBe("denied");
  });
  it("un valore sconosciuto vale come nessuna scelta", () => {
    expect(readConsent(mem({ "linerfm.tt-consent": "maybe" }))).toBeNull();
  });
  it("storage che lancia (Safari privato): nessuna scelta, nessuna eccezione", () => {
    const broken: KV = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(readConsent(broken)).toBeNull();
    expect(() => writeConsent(broken, "granted")).not.toThrow();
    expect(() => clearTracking(broken)).not.toThrow();
  });
  it("il rifiuto cancella il ttclid salvato", () => {
    const s = mem({ "linerfm.ttclid": "CLICK" });
    clearTracking(s);
    expect(s.m.has("linerfm.ttclid")).toBe(false);
  });
});

describe("ttclid e cookie", () => {
  it("legge ttclid dalla query della landing", () => {
    expect(ttclidFrom("?utm_source=tiktok&ttclid=E.C.P.abc")).toBe("E.C.P.abc");
    expect(ttclidFrom("?utm_source=tiktok")).toBeNull();
    expect(ttclidFrom("")).toBeNull();
  });
  it("legge _ttp tra altri cookie", () => {
    expect(readCookie("a=1; _ttp=2Xyz.9; b=3", "_ttp")).toBe("2Xyz.9");
    expect(readCookie("a=1", "_ttp")).toBeNull();
  });
});

describe("link di checkout", () => {
  it("aggiunge il consenso e gli identificativi come custom data di Lemon Squeezy", () => {
    const u = new URL(checkoutUrl(CHECKOUT, { ttclid: "CLICK", ttp: "TTP" }));
    expect(u.searchParams.get("embed")).toBe("1");
    expect(u.searchParams.get("checkout[custom][tt_consent]")).toBe("1");
    expect(u.searchParams.get("checkout[custom][ttclid]")).toBe("CLICK");
    expect(u.searchParams.get("checkout[custom][ttp]")).toBe("TTP");
  });
  it("è idempotente: riscrivere due volte non duplica i parametri", () => {
    const once = checkoutUrl(CHECKOUT, { ttclid: "A", ttp: null });
    const twice = checkoutUrl(once, { ttclid: "B", ttp: null });
    const u = new URL(twice);
    expect(u.searchParams.getAll("checkout[custom][ttclid]")).toEqual(["B"]);
    expect(u.searchParams.getAll("checkout[custom][tt_consent]")).toEqual(["1"]);
  });
  it("senza identificativi manda solo il consenso", () => {
    const u = new URL(checkoutUrl(CHECKOUT, { ttclid: null, ttp: null }));
    expect(u.searchParams.has("checkout[custom][ttclid]")).toBe(false);
    expect(u.searchParams.has("checkout[custom][ttp]")).toBe(false);
  });
});

describe("Purchase lato browser da Checkout.Success", () => {
  it("event_id è l'id ordine, come lato server: TikTok deduplica", () => {
    const p = purchaseFromCheckout({ event: "Checkout.Success",
      data: { type: "orders", id: "8881674", attributes: { total: 1000, currency: "EUR" } } });
    expect(p).toEqual({ event_id: "8881674", value: 10, currency: "EUR" });
  });
  it("altri eventi o ordine senza id: niente", () => {
    expect(purchaseFromCheckout({ event: "PaymentMethodUpdate.Closed" })).toBeNull();
    expect(purchaseFromCheckout({ event: "Checkout.Success", data: {} })).toBeNull();
  });
});
