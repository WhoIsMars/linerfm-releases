// Loghi dei marchi per la riga "Works with", dal pacchetto npm `simple-icons` (versione fissata in
// package.json). Si importano i singoli SVG e non l'indice: l'indice pesa 5 MB e rallentava il dev
// server a ogni pagina. I colori sono quelli del pacchetto (`hex`): brand-icons.test.ts li confronta
// con l'indice, cosi' un aggiornamento di simple-icons non li lascia indietro.
import spotify from "simple-icons/icons/spotify.svg?raw";
import applemusic from "simple-icons/icons/applemusic.svg?raw";
import youtubemusic from "simple-icons/icons/youtubemusic.svg?raw";
import soundcloud from "simple-icons/icons/soundcloud.svg?raw";
import apple from "simple-icons/icons/apple.svg?raw";

export interface BrandIcon { slug: string; hex: string; path: string }

/** Il `d` del primo <path> di un SVG di simple-icons. */
export const pathOf = (svg: string): string => svg.match(/<path d="([^"]+)"/)?.[1] ?? "";

export const BRAND: Record<"spotify" | "applemusic" | "youtubemusic" | "soundcloud" | "apple", BrandIcon> = {
  spotify: { slug: "spotify", hex: "1ED760", path: pathOf(spotify) },
  applemusic: { slug: "applemusic", hex: "FA243C", path: pathOf(applemusic) },
  youtubemusic: { slug: "youtubemusic", hex: "FF0000", path: pathOf(youtubemusic) },
  soundcloud: { slug: "soundcloud", hex: "FF5500", path: pathOf(soundcloud) },
  apple: { slug: "apple", hex: "000000", path: pathOf(apple) },
};
