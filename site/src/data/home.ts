// Le schermate della home: una frase e un media ciascuna.
//
// Regole:
//  - ogni frase viene da una card di features.json (`cards`, gli id stanno in `from`), riscritta in
//    una riga; i nomi di look, temi e voci di menu sono quelli dell'app (repo linerfm):
//    look del widget src/widget.jsx:1998, menu src/widget.jsx:1042 (Play on), 1946 (Source),
//    1977 (Search), 1987-1990 (Create playlist, Find playlist, Optimize, Add tracks),
//    2007-2008 (Dynamic color, Canvas video); temi di notch e screensaver
//    sidecar/linerfm/ui/src/notch/themes.ts:82-234; ⇧⌘S src/widget.jsx:2020;
//  - due tipi di media, entrambi veri: le riprese del telefono dell'owner (`kind: "phone"`,
//    verticali, da .planning/social-v2/work/takes/ph8698|ph8700|ph8701) e, dal 24/10/2026 su
//    richiesta dell'owner, le catture della UI VERA del prodotto (`kind: "screen"`): widget,
//    notch, screensaver e finestra AI resi in Chromium dal codice dell'app con
//    .planning/site-v2/site-takes.cjs, con brani e copertine vere. Mai mockup disegnati;
//  - `glow`: i due colori della luce attorno al media, presi dalla ripresa (la luce che si vede
//    nel video, o la copertina che suona). Mai il verde: il verde e' delle azioni;
//  - `media: null` = il media non esiste ancora: la schermata e' pronta ma non va in pagina.

import type { Cue } from "../lib/style-cues";

export interface Take {
  /** "phone": ripresa verticale del telefono; "screen": cattura orizzontale della UI vera. */
  kind?: "phone" | "screen";
  /** Video: percorso dell'mp4 in public/; il poster e' lo stesso nome in .jpg. */
  video?: string;
  /** Immagine ferma, quando c'e' solo un fotogramma buono. */
  image?: string;
  alt: string;
  caption: string;
}

export interface FeatureScreenData {
  id: string;
  /** Etichetta piccola sopra il titolo. */
  eyebrow?: string;
  title: string;
  /** Parte finale del titolo, accesa nel colore della luce. */
  halo?: string;
  /** Stili e funzioni veri, con i nomi dell'app. */
  chips?: string[];
  /** Quando lo stile di un chip entra nel video (secondi, misurati sui fotogrammi): il chip si
   *  accende mentre lo stile è in onda e un clic porta il video lì. I chip senza cue restano testo. */
  cues?: Cue[];
  /** I due colori della luce ai bordi del media. */
  glow?: [string, string];
  line: string;
  /** Id delle card di features.json da cui vengono le frasi. */
  from: string[];
  media: Take | null;
  /** Per le schermate senza media: la registrazione che serve. */
  wanted?: string;
}

const SCREEN_CAPTION = "Captured from the app itself, playing real songs.";

export const FEATURE_SCREENS: FeatureScreenData[] = [
  {
    id: "colors",
    eyebrow: "Live desktop",
    title: "Every song",
    halo: "repaints your desktop.",
    line: "Skip a track and the wallpaper, the colors and the albums under the clock change with it.",
    from: ["live-desktop", "dynamic-color"],
    // la luce ciano attorno al portatile nella ripresa, il rosa della copertina di Lucid Dreams
    glow: ["#5ad1ff", "#ff6fa8"],
    media: {
      kind: "phone",
      video: "media/colors.mp4",
      alt: "A MacBook and a monitor: FUXX by XXXTENTACION plays on a grey wallpaper, the track changes to Lucid Dreams by Juice WRLD and both desktops take its artwork, with a cyan light around the laptop screen.",
      caption: "Real footage, filmed on the owner's desk.",
    },
  },
  {
    id: "widget",
    eyebrow: "Widget",
    title: "One widget,",
    halo: "five looks.",
    line: "It plays the song's video on your desktop. Its menu switches the Source, picks where it plays, opens Search and the AI playlist tools.",
    chips: ["Glass", "Cinematic", "Minimal", "Compact", "Terminal"],
    // widget.mp4: dissolvenze tra i cinque PNG di site-takes.cjs, metà dissolvenza da scene score
    cues: [{ label: "Glass", at: 0 }, { label: "Cinematic", at: 1.57 }, { label: "Minimal", at: 2.95 },
      { label: "Compact", at: 4.28 }, { label: "Terminal", at: 5.58 }, { label: "Glass", at: 6.97 }],
    from: ["widget", "terminal-theme", "ai-playlists"],
    glow: ["#69c1ea", "#ff6b8b"],
    media: {
      kind: "screen",
      video: "media/widget.mp4",
      alt: "The LinerFM widget playing Lucid Dreams by Juice WRLD, switching through its five looks: Glass, Cinematic, Minimal, Compact and Terminal.",
      caption: SCREEN_CAPTION,
    },
  },
  {
    id: "edge-light",
    eyebrow: "Edge light",
    title: "A light around",
    halo: "your screen.",
    line: "In the cover's colors or one you pick, thin or wide, soft or strong. It can follow the beat.",
    from: ["edge-light-custom", "live-desktop"],
    // la luce gialla della ripresa
    glow: ["#ffd54a", "#ff8a5c"],
    media: {
      kind: "phone",
      video: "media/light.mp4",
      alt: "Fair Trade by Drake plays and a yellow light runs around the edge of the MacBook screen, under a wallpaper made from the album artwork.",
      caption: "Real footage. The color and width are yours to set, per display.",
    },
  },
  {
    id: "notch",
    eyebrow: "Notch",
    title: "Your notch",
    halo: "becomes a player.",
    line: "Hover it for the track, the controls and a seek bar you can drag, with the lyrics line by line right under it.",
    chips: ["Artwork", "Onyx", "Glass", "Vinyl", "Midnight"],
    // notch.mp4 (25/10): ripresa vera dal telefono dell'owner, IMG_8758.MOV da 6 a 14,4 s.
    // Cambi di canzone dal pannello e testi veri; i temi non passano uno per uno: restano testo.
    from: ["notch-hover", "karaoke", "vinyl-midnight-themes"],
    glow: ["#39b0ea", "#a18cff"],
    media: {
      kind: "phone",
      video: "media/notch.mp4",
      alt: "Filmed on a MacBook: the notch player is open and the song changes from it, from Party By Myself to Legends and Fast by Juice WRLD, while the synced lyrics run on the desktop below.",
      caption: "Real footage. Songs change right from the notch, the lyrics follow.",
    },
  },
  {
    id: "screensaver",
    eyebrow: "Screensaver",
    title: "Step away.",
    halo: "The song stays.",
    line: "Full screen artwork and lyrics on every display when you leave the computer, or right away with ⇧⌘S on a Mac. It changes with every song.",
    chips: ["Artwork", "Onyx", "Glass", "Vinyl", "Midnight"],
    // screensaver.mp4 (24/10, sera): controlli visibili, i cinque stili cliccati sul selettore vero
    // ai tempi qui sotto, poi SICKO MODE a 7,1 s. Senza controlli gli stili differivano quasi solo
    // nella forma della copertina e l'owner non li vedeva.
    cues: [{ label: "Artwork", at: 0 }, { label: "Onyx", at: 1.6 }, { label: "Glass", at: 3.2 },
      { label: "Vinyl", at: 4.8 }, { label: "Midnight", at: 6.4 }],
    from: ["screensaver", "vinyl-midnight-themes"],
    glow: ["#ff8a3d", "#ff4f6d"],
    media: {
      kind: "screen",
      video: "media/screensaver.mp4",
      alt: "The music screensaver playing Blinding Lights by The Weeknd while its style changes from Artwork to Onyx, Glass, Vinyl and Midnight, then SICKO MODE by Travis Scott.",
      caption: SCREEN_CAPTION,
    },
  },
  {
    id: "ai-playlists",
    eyebrow: "AI playlists",
    title: "Playlists",
    halo: "from a sentence.",
    line: "Describe a mood and the AI picks real tracks. Find a playlist by describing it, add tracks from text, and optimize one with the numbers of every song.",
    chips: ["Create playlist", "Find playlist", "Add tracks", "Optimize"],
    // ai.mp4 (25/10): le quattro funzioni dalla UI vera, una dopo l'altra. Create con una frase;
    // Add tracks con tre titoli incollati; Find con due playlist pubbliche vere di Spotify (nome,
    // autore, copertina e brani dall'anteprima pubblica, follower non mostrati); Optimize su
    // "Late night drive" con brani veri e numeri d'ascolto di esempio.
    cues: [{ label: "Create playlist", at: 0 }, { label: "Add tracks", at: 5.45 },
      { label: "Find playlist", at: 10.35 }, { label: "Optimize", at: 15.65 }],
    from: ["ai-playlists", "discover", "curator", "track-stats", "skip-based-removals"],
    glow: ["#ff8a5c", "#b38cff"],
    media: {
      kind: "screen",
      video: "media/ai.mp4",
      alt: "Four AI tools in the app. Create: a sentence becomes eleven real tracks. Add tracks: three pasted titles are found on Spotify and added. Find: RapCaviar and Most Necessary come up for new rap. Optimize: two often skipped songs go out and two from your history come in.",
      caption: "Captured from the app itself. The AI runs on your own free Groq key.",
    },
  },
  {
    id: "search",
    eyebrow: "Search",
    // titolo con le parole dell'owner (24/10)
    title: "Type a song, album, artist",
    halo: "or playlist name.",
    line: "One shortcut from any app, a few letters, Enter: it plays. Spotify never comes to the front.",
    from: ["search", "search-filters"],
    glow: ["#9cc8ff", "#c8b4ff"],
    media: {
      kind: "phone",
      video: "media/search.mp4",
      alt: "The search box over the desktop of a MacBook: juice is typed and the results list albums and the artist Juice WRLD.",
      // scorciatoie: src-tauri/src/lib.rs:7359 nel repo dell'app
      caption: "Real footage. ⌘⇧K on a Mac, Ctrl+Alt+K on Windows.",
    },
  },
  // ── Pronte, senza media: non vanno in pagina ──
  {
    id: "lyrics",
    title: "The lyrics, on your desktop.",
    line: "Synced lyrics follow whatever you play: Spotify, Apple Music, a YouTube video in your browser or a SoundCloud track.",
    from: ["lyrics-every-source", "karaoke"],
    media: null,
    wanted: "QuickTime, 6 s: i testi sincronizzati sul desktop e sotto la notch su una canzone famosa (dal telefono: i testi veri non si rendono dalla UI per i diritti).",
  },
  {
    id: "source",
    title: "Switch the source with one click.",
    line: "Spotify, Apple Music, YouTube Music or the browser player, from the widget menu. The whole app follows.",
    from: ["youtube-music", "soundcloud"],
    media: null,
    wanted: "QuickTime, 5 s: menu del widget, riga Source, clic da Spotify a YouTube, il widget cambia.",
  },
];

/** Una riga, senza media: le cose vere che non hanno (ancora) una schermata. Nomi dalle card. */
export const ALSO = [
  "synced lyrics under the notch",
  "your listening stats",
  "Last.fm scrobbling",
  "Discord presence",
];

/** "a, b and c" */
export const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
