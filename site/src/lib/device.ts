// Telefono o computer, deciso prima del primo disegno (BaseLayout mette html.ua-mobile).

/** Phones and tablets, iPads included: iPadOS reports itself as a Mac, but Macs have no touch points. */
export function isMobileUA(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}
