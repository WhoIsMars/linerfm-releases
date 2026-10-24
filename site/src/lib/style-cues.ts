// Stili che un video vero mostra in sequenza: `at` è il secondo in cui lo stile `label` entra,
// misurato sui fotogrammi del video. Serve ai chip che si accendono sullo stile in onda.
export interface Cue { label: string; at: number }

/** Lo stile in video al secondo `t`: l'ultimo cue già iniziato, o niente prima del primo. */
export function activeCue(cues: readonly Cue[], t: number): string | undefined {
  let best: Cue | undefined;
  for (const c of cues) if (c.at <= t && (!best || c.at >= best.at)) best = c;
  return best?.label;
}
