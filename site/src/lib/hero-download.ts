// Il pulsante dell'hero scarica subito la build del computer di chi guarda (conversione 21/10:
// chi scarica decide in 6-64 secondi, e "Try free" mandava 9.105 px piu' in basso).
import type { DmgInfo, MacDmgs } from "./release";

export interface HeroBuild { label: string; arch: string; info: DmgInfo | null; }
export interface HeroChoice { primary: HeroBuild; others: HeroBuild[]; }

export function heroChoice(onWindows: boolean, dmgs: MacDmgs, exe: DmgInfo | null): HeroChoice {
  const mac: HeroBuild[] = [];
  if (dmgs.appleSilicon) mac.push({ label: "Download for Mac", arch: "apple-silicon", info: dmgs.appleSilicon });
  if (dmgs.intel) mac.push({ label: "Download for Mac", arch: "intel", info: dmgs.intel });
  const win: HeroBuild[] = exe ? [{ label: "Download for Windows", arch: "windows", info: exe }] : [];
  const order = onWindows ? [...win, ...mac] : [...mac, ...win];
  const [primary, ...others] = order.length ? order : [{ label: "Download", arch: "github-page", info: null }];
  return { primary, others: others.map(asSmall) };
}

// Le altre build, come righe piccole sotto il pulsante: dicono solo cosa sono.
function asSmall(b: HeroBuild): HeroBuild {
  const label = b.arch === "apple-silicon" ? "Apple Silicon Mac" : b.arch === "intel" ? "Intel Mac" : "Windows";
  return { ...b, label };
}
