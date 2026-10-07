// Dimensioni native dei media di public/. Servono a dichiarare width e height
// in pagina: senza, il layout salta quando il file arriva (CLS).
//
// I dati di Surfaces arrivano da features.json, generato da
// docs/product-surface.json nel repo dell'app: quel file non può portare le
// dimensioni, quindi stanno qui.
//
// Per rigenerare dopo aver rigirato un video o uno screenshot:
//   ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
//           -of csv=p=0 public/video/<file>.mp4
//   sips -g pixelWidth -g pixelHeight public/screenshots/<file>.png

export type MediaSize = { width: number; height: number };

const SIZES: Record<string, MediaSize> = {
  "video/demo.mp4": { width: 1920, height: 1252 },
  "video/hero-clip.mp4": { width: 1920, height: 1252 },
  "video/notch.mp4": { width: 1600, height: 336 },
  "video/screensaver.mp4": { width: 1440, height: 938 },
  "video/search.mp4": { width: 1600, height: 1042 },
  "screenshots/ai.png": { width: 1180, height: 590 },
  "screenshots/apply.png": { width: 1684, height: 1422 },
  "screenshots/connect.png": { width: 1498, height: 1098 },
  "screenshots/gatekeeper-1.png": { width: 1320, height: 800 },
  "screenshots/gatekeeper-2.png": { width: 586, height: 572 },
  "screenshots/gatekeeper-3.png": { width: 584, height: 702 },
  "screenshots/hud.png": { width: 320, height: 120 },
  "screenshots/karaoke.png": { width: 760, height: 110 },
  "screenshots/notch.png": { width: 640, height: 240 },
  "screenshots/widget.png": { width: 740, height: 746 },
};

/** Dimensioni native di un media, o undefined se non censito. */
export function mediaSize(src: string): MediaSize | undefined {
  return SIZES[src.replace(/^\//, "")];
}
