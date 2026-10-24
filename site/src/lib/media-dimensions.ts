// Dimensioni native dei media di public/. Servono a dichiarare width e height
// in pagina: senza, il layout salta quando il file arriva (CLS).
//
// Per rigenerare dopo aver rigirato un video o uno screenshot:
//   ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
//           -of csv=p=0 public/video/<file>.mp4
//   sips -g pixelWidth -g pixelHeight public/screenshots/<file>.png

export type MediaSize = { width: number; height: number };

const SIZES: Record<string, MediaSize> = {
  // Riprese vere del telefono dell'owner (24/10/2026), ritagliate in verticale per la home.
  "media/hero.mp4": { width: 720, height: 1000 },
  "media/colors.mp4": { width: 720, height: 1000 },
  "media/light.mp4": { width: 720, height: 1000 },
  "media/search.mp4": { width: 720, height: 1000 },
  // Catture della UI vera (24/10/2026, .planning/site-v2/site-takes.cjs nel repo dell'app).
  "media/widget.mp4": { width: 944, height: 720 },
  "media/notch.mp4": { width: 1216, height: 416 },
  "media/screensaver.mp4": { width: 1280, height: 800 },
  "media/ai.mp4": { width: 1280, height: 884 },
  "video/clip-notch.mp4": { width: 1200, height: 900 },
  "video/clip-screensaver.mp4": { width: 1200, height: 900 },
  "video/clip-search.mp4": { width: 1200, height: 900 },
  "video/clip-live-desktop.mp4": { width: 960, height: 960 },
  "video/clip-windows.mp4": { width: 1020, height: 1138 },
  "screenshots/gatekeeper-1.png": { width: 1320, height: 800 },
  "screenshots/gatekeeper-2.png": { width: 586, height: 572 },
  "screenshots/gatekeeper-3.png": { width: 584, height: 702 },
};

/** Dimensioni native di un media, o undefined se non censito. */
export function mediaSize(src: string): MediaSize | undefined {
  return SIZES[src.replace(/^\//, "")];
}
