// Dimensioni native dei media di public/. Servono a dichiarare width e height
// in pagina: senza, il layout salta quando il file arriva (CLS).
//
// Per rigenerare dopo aver rigirato un video o uno screenshot:
//   ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
//           -of csv=p=0 public/video/<file>.mp4
//   sips -g pixelWidth -g pixelHeight public/screenshots/<file>.png

export type MediaSize = { width: number; height: number };

const SIZES: Record<string, MediaSize> = {
  "video/explainer.mp4": { width: 1920, height: 1080 },
  "video/clip-notch.mp4": { width: 1200, height: 900 },
  "video/clip-widget.mp4": { width: 1200, height: 900 },
  "video/clip-screensaver.mp4": { width: 1200, height: 900 },
  "video/clip-search.mp4": { width: 1200, height: 900 },
  "video/clip-ai.mp4": { width: 1200, height: 900 },
  "video/clip-cleanup.mp4": { width: 1200, height: 900 },
  "screenshots/gatekeeper-1.png": { width: 1320, height: 800 },
  "screenshots/gatekeeper-2.png": { width: 586, height: 572 },
  "screenshots/gatekeeper-3.png": { width: 584, height: 702 },
};

/** Dimensioni native di un media, o undefined se non censito. */
export function mediaSize(src: string): MediaSize | undefined {
  return SIZES[src.replace(/^\//, "")];
}
