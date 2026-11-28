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
    line: "Skip a track and the wallpaper, the colors and the albums under the clock change with it. The Spotify canvas can fill your whole desktop, like a music video.",
    from: ["live-desktop", "dynamic-color", "desktop-cover"],
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
    id: "looks",
    eyebrow: "Live desktop",
    // dieci stili delle copertine: FLOW_STYLES in sidecar/linerfm/ui/src/desktop/style.ts:93 (1.9.0)
    title: "Ten styles",
    halo: "for your covers.",
    line: "A button in the player bar goes through them: Cover Flow, Arc, Artist, Dial, Vinyl, Polaroid, Jewel case, Wall, Tilt and Slices. Drag the bar, the list and the covers where you want them: they stay there.",
    chips: ["Cover Flow", "Arc", "Artist", "Dial", "Vinyl", "Polaroid", "Jewel case", "Wall", "Tilt", "Slices"],
    // covers.mp4 (28/11/2026, 1.9.0): il desktop vero dell'app (desktop-harness.cjs, pagine /desktop e
    // /desktop-ui della 1.9.0) a 1440x900 con scala 2, ritaglio 864x504 su copertine e barra, nativo
    // 1728x1008. Uno stile ogni 2,5 s (75 fotogrammi a 30 fps), da Blinding Lights a SICKO MODE a 0,6 s di
    // ognuno. Brani, artisti e copertine veri (scratchpad desk/real.cjs: art-real/ al posto dei brani finti).
    cues: [{ label: "Cover Flow", at: 0 }, { label: "Arc", at: 2.5 }, { label: "Artist", at: 5 }, { label: "Dial", at: 7.5 },
      { label: "Vinyl", at: 10 }, { label: "Polaroid", at: 12.5 }, { label: "Jewel case", at: 15 }, { label: "Wall", at: 17.5 },
      { label: "Tilt", at: 20 }, { label: "Slices", at: 22.5 }],
    from: ["desktop-bar-buttons", "desktop-arc", "desktop-artist", "desktop-dial", "desktop-move-panels", "vinyl-covers", "desktop-covers-1-9"],
    glow: ["#ff8a3d", "#e8c25a"],
    media: {
      kind: "screen",
      video: "media/covers.mp4",
      alt: "The live desktop on a Mac with the player bar, going through the ten cover styles while the song changes from Blinding Lights by The Weeknd to SICKO MODE by Travis Scott: Cover Flow, Arc, Artist, Dial, Vinyl, Polaroid, Jewel case, Wall, Tilt and Slices.",
      caption: "Recorded from the app's own desktop pages, playing real songs.",
    },
  },
  {
    id: "styles",
    eyebrow: "Desktop and screensaver",
    title: "Dress your screen",
    halo: "in the song's colors.",
    line: "A soft light behind the cover in four styles, or the song's title large across the screen in four more. Set the screensaver to Desktop and it looks like your desktop.",
    chips: ["Drift", "Bokeh", "Halo", "Silk", "Ticker", "Spine", "Credits", "Collage"],
    // styles.mp4 (28/11/2026, 1.9.0): il desktop vero dell'app (desktop-harness.cjs) a schermo intero,
    // 1440x900 con scala 2, ridotto a 1728x1080. Uno stile ogni 2,5 s, da Blinding Lights a SICKO MODE a 1 s
    // di ognuno, brani e copertine veri.
    // Le copertine (Polaroid, Jewel case, Wall, Tilt, Slices) sono in covers.mp4, sezione "looks".
    cues: [{ label: "Drift", at: 0 }, { label: "Bokeh", at: 2.5 }, { label: "Halo", at: 5 }, { label: "Silk", at: 7.5 },
      { label: "Ticker", at: 10 }, { label: "Spine", at: 12.5 }, { label: "Credits", at: 15 }, { label: "Collage", at: 17.5 }],
    from: ["desktop-ambient-light", "desktop-big-title", "screensaver-desktop"],
    glow: ["#e06f4f", "#e8c25a"],
    media: {
      kind: "screen",
      video: "media/styles.mp4",
      alt: "The live desktop on a Mac, recorded from the app: a soft light behind the cover in four styles (Drift, Bokeh, Halo, Silk), then the song title large in four styles (Ticker, Spine, Credits, Collage), while Blinding Lights by The Weeknd changes to SICKO MODE by Travis Scott.",
      caption: "Recorded from the app's own desktop pages, playing real songs.",
    },
  },
  {
    id: "widget",
    eyebrow: "Widget",
    title: "One widget,",
    halo: "eight looks.",
    line: "It plays the song's video on your desktop. Its menu switches the Source, picks where it plays, opens Search and the AI playlist tools.",
    chips: ["Glass", "Cinematic", "Minimal", "Compact", "Pill", "Receipt", "Tape", "Terminal"],
    // widget.mp4 (28/11/2026, 1.9.0): gli otto temi di THEME_CHOICES (src/widget.jsx:933) che suonano
    // brani veri, resi da site-takes.cjs (take wanim) a scala 4 su sfondo trasparente e posati al centro
    // dello stesso fondale 1888x1440. Scala uniforme chiesta dall'owner: ogni look ridotto o ingrandito
    // finché la radice della sua area fa 700 px (sempre da scala 4, quindi mai ingrandito oltre i pixel
    // resi); Terminal resta alla sua grandezza. 3 s a tema, il brano cambia a 1,2 s di ognuno.
    cues: [{ label: "Glass", at: 0 }, { label: "Cinematic", at: 3 }, { label: "Minimal", at: 6 },
      { label: "Compact", at: 9 }, { label: "Pill", at: 12 }, { label: "Receipt", at: 15 },
      { label: "Tape", at: 18 }, { label: "Terminal", at: 21 }],
    from: ["widget", "terminal-theme", "ai-playlists", "widget-themes-1-9"],
    glow: ["#69c1ea", "#ff6b8b"],
    media: {
      kind: "screen",
      video: "media/widget.mp4",
      alt: "The LinerFM widget in its eight looks, each playing Lucid Dreams by Juice WRLD and then SICKO MODE by Travis Scott: Glass, Cinematic, Minimal, Compact, Pill, Receipt, Tape and Terminal.",
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
    // notch.mp4 (25/10 pomeriggio, owner da iPhone: notch tagliata, temi non cliccabili): striscia
    // 960x426 larga quanto la sezione. 0-8,4 s ripresa vera (IMG_8758.MOV da 6 a 14,4 s, ritaglio sul
    // pannello, tema Artwork), poi i cinque temi dalla UI dell'app (il notch.mp4 di prima della PR #9,
    // cue verificati allora fotogramma per fotogramma, qui spostati di 8,4 s).
    cues: [{ label: "Artwork", at: 0 }, { label: "Onyx", at: 10.0 }, { label: "Glass", at: 11.4 },
      { label: "Vinyl", at: 12.8 }, { label: "Midnight", at: 14.83 }],
    from: ["notch-hover", "karaoke", "vinyl-midnight-themes"],
    glow: ["#39b0ea", "#a18cff"],
    media: {
      kind: "screen",
      video: "media/notch.mp4",
      alt: "First filmed on a MacBook: the notch player is open and the song changes from it, from Party By Myself to Legends and Fast by Juice WRLD. Then the same player captured from the app in its five themes: Artwork, Onyx, Glass, Vinyl and Midnight.",
      caption: "Real footage first, then the five themes captured from the app.",
    },
  },
  {
    id: "screensaver",
    eyebrow: "Screensaver",
    title: "Step away.",
    halo: "The song stays.",
    line: "Full screen artwork and lyrics on every display when you leave the computer, or right away with ⇧⌘S on a Mac. It changes with every song, or set it to Desktop and it looks like your desktop.",
    chips: ["Artwork", "Onyx", "Glass", "Vinyl", "Midnight"],
    // screensaver.mp4 (24/10, sera): controlli visibili, i cinque stili cliccati sul selettore vero
    // ai tempi qui sotto, poi SICKO MODE a 7,1 s. Senza controlli gli stili differivano quasi solo
    // nella forma della copertina e l'owner non li vedeva.
    cues: [{ label: "Artwork", at: 0 }, { label: "Onyx", at: 1.6 }, { label: "Glass", at: 3.2 },
      { label: "Vinyl", at: 4.8 }, { label: "Midnight", at: 6.4 }],
    from: ["screensaver", "vinyl-midnight-themes", "screensaver-desktop"],
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
    eyebrow: "Playlists",
    title: "Playlists",
    halo: "from a sentence.",
    line: "Describe a mood and the AI picks real tracks, or optimize a playlist with the numbers of every song. Copy a playlist from Spotify to Apple Music or YouTube Music and back, or align them so they hold the same songs.",
    chips: ["Create playlist", "Find playlist", "Add tracks", "Optimize", "Copy to…", "Align playlists"],
    // ai.mp4 (25/10): le quattro funzioni dalla UI vera, una dopo l'altra. Create con una frase;
    // Add tracks con tre titoli incollati; Find con due playlist pubbliche vere di Spotify (nome,
    // autore, copertina e brani dall'anteprima pubblica, follower non mostrati); Optimize su
    // "Late night drive" con brani veri e numeri d'ascolto di esempio.
    cues: [{ label: "Create playlist", at: 0 }, { label: "Add tracks", at: 5.45 },
      { label: "Find playlist", at: 10.35 }, { label: "Optimize", at: 15.65 },
      // da 20,9 s (28/11/2026, 1.9.0): Align playlists e Copy to… dalla UI vera (site-takes.cjs, take sync)
      // con playlist d'esempio e le risposte di /api/playlist-sync simulate; ridotta a 1140 di larghezza
      { label: "Align playlists", at: 20.9 }, { label: "Copy to…", at: 29.9 }],
    from: ["ai-playlists", "discover", "curator", "track-stats", "skip-based-removals", "copy-playlists", "apple-music-library"],
    glow: ["#ff8a5c", "#b38cff"],
    media: {
      kind: "screen",
      video: "media/ai.mp4",
      alt: "Four AI tools in the app. Create: a sentence becomes eleven real tracks. Add tracks: three pasted titles are found on Spotify and added. Find: RapCaviar and Most Necessary come up for new rap. Optimize: two often skipped songs go out and two from your history come in. Then Align playlists creates the missing playlists on Apple Music, YouTube Music and Spotify, and Copy to sends one playlist to YouTube Music.",
      caption: "Captured from the app itself, with sample playlists. The AI runs on your own free Groq key. Apple Music playlists on Mac.",
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
    line: "Spotify, Apple Music, YouTube Music, Amazon Music or the browser player, from the widget menu. The whole app follows.",
    from: ["youtube-music", "soundcloud"],
    media: null,
    wanted: "QuickTime, 5 s: menu del widget, riga Source, clic da Spotify a YouTube, il widget cambia.",
  },
];

/** Una riga, senza media: le cose vere che non hanno (ancora) una schermata. Nomi dalle card. */
export const ALSO = [
  // fill-lyrics (1.9.0); luce, titolo, copertine e temi del widget della 1.9.0 hanno ora una schermata
  "Fill lyrics, where the line fills with color as it is sung",
  // soundcloud-full-source, hide-spotify (1.9.0)
  "SoundCloud as a full source, with search, your playlists and Discover, and Spotify hidden if you don't use it",
  // ai-every-source, amazon-music (1.8.0); copy-playlists sta nella schermata delle playlist
  "AI playlists on Spotify, YouTube Music and Apple Music, and Amazon Music",
  // one-word-lyrics, vinyl-covers, desktop-presets, saved-setups, edge-effects-1-7 (1.7.0):
  // senza schermata per lo stesso tetto di public/media.
  "lyrics one word at a time, a spinning vinyl, presets and your own saved setups, and 16 lights around the screen",
  // lyrics-every-source (1.2.0), lyrics-from-spotify (1.2.2), lyrics-song-colors (1.2.3)
  "synced lyrics for Spotify, YouTube and SoundCloud, in the song's colors",
  "your listening stats",
  "Last.fm scrobbling",
  "Discord presence",
];

/** "a, b and c" */
export const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
