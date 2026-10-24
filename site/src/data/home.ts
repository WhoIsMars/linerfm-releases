// Le schermate della home (24/10/2026, sul modello di iBaila): una frase e una ripresa ciascuna.
//
// Regole:
//  - ogni frase viene da una card di features.json (`cards`, gli id stanno in `from`), riscritta in
//    una riga; i nomi di look e temi sono quelli dell'app (widget: src/host/widget-menu.test.tsx:186,
//    notch: sidecar/linerfm/ui/src/notch/themes.ts, AI: src/widget.jsx:1959-1962 nel repo dell'app);
//  - il media e' una ripresa VERA del telefono dell'owner (public/media, da
//    .planning/social-v2/work/takes/ph8698|ph8700|ph8701 nel repo dell'app), mai un render della UI;
//  - `media: null` = la ripresa non esiste ancora: la schermata e' pronta ma non va in pagina
//    (FeatureScreen non disegna niente). `wanted` dice cosa registrare.

export interface Take {
  /** Video: percorso dell'mp4 in public/; il poster e' lo stesso nome in .jpg. */
  video?: string;
  /** Immagine ferma, quando c'e' solo un fotogramma buono. */
  image?: string;
  alt: string;
  caption: string;
}

export interface FeatureScreenData {
  id: string;
  title: string;
  line: string;
  /** Id delle card di features.json da cui vengono le frasi. */
  from: string[];
  media: Take | null;
  /** Per le schermate senza media: la registrazione che serve. */
  wanted?: string;
}

export const FEATURE_SCREENS: FeatureScreenData[] = [
  {
    id: "colors",
    title: "Every song repaints your desktop.",
    line: "Skip a track and the wallpaper, the colors and the albums under the clock change with it.",
    from: ["live-desktop", "dynamic-color"],
    media: {
      video: "media/colors.mp4",
      alt: "A MacBook and a monitor: FUXX by XXXTENTACION plays on a grey wallpaper, the track changes to Lucid Dreams by Juice WRLD and both desktops take its artwork, with a cyan light around the laptop screen.",
      caption: "Real footage, filmed on the owner's desk.",
    },
  },
  {
    id: "edge-light",
    title: "A light around your screen.",
    line: "In the cover's colors or one you pick, thin or wide, soft or strong. It can follow the beat.",
    from: ["edge-light-custom", "live-desktop"],
    media: {
      video: "media/light.mp4",
      alt: "Fair Trade by Drake plays and a yellow light runs around the edge of the MacBook screen, under a wallpaper made from the album artwork.",
      caption: "Real footage. The color and width are yours to set, per display.",
    },
  },
  {
    id: "widget",
    title: "A widget that plays the song's video.",
    line: "Five looks: Glass, Cinematic, Minimal, Compact and Terminal. Its menu switches the source and opens search and the AI playlist tools.",
    // menu: src/widget.jsx MenuTile (Search, Create playlist, Find playlist, Optimize, Add tracks) e il gruppo Source
    from: ["widget", "terminal-theme", "ai-playlists"],
    media: {
      image: "media/widget.jpg",
      alt: "The LinerFM widget in its Glass look on a desktop, playing the Spotify Canvas of Hate Me by Ellie Goulding, with the progress bar and the controls under it.",
      caption: "A still from real footage: the Glass look, playing a Canvas.",
    },
    wanted: "Una ripresa di 5 s del widget che cambia look dal menu (Glass, Cinematic, Minimal, Compact, Terminal): oggi c'e' solo il fotogramma fermo.",
  },
  {
    id: "search",
    title: "Type a song from any app.",
    line: "One shortcut, a few letters, Enter: it plays. Spotify never comes to the front.",
    from: ["search", "search-filters"],
    media: {
      video: "media/search.mp4",
      alt: "On a MacBook the search box opens over the desktop, juice is typed and the results list Juice WRLD.",
      // scorciatoie: src-tauri/src/lib.rs:7359 nel repo dell'app
      caption: "Real footage. ⌘⇧K on a Mac, Ctrl+Alt+K on Windows.",
    },
  },
  // ── Pronte, senza ripresa vera: non vanno in pagina finche' l'owner non registra ──
  {
    id: "notch",
    title: "Your notch becomes a player.",
    line: "Hover it for the track and a seek bar, with the lyrics line by line right under it. Five themes: Artwork, Onyx, Glass, Vinyl and Midnight.",
    from: ["notch-hover", "karaoke", "vinyl-midnight-themes"],
    media: null,
    wanted: "QuickTime, 6 s: il mouse va sulla notch, si apre il player, sotto scorre il karaoke; poi cambio tema da Settings.",
  },
  {
    id: "lyrics",
    title: "The lyrics, on your desktop.",
    line: "Synced lyrics follow whatever you play: Spotify, Apple Music, a YouTube video in your browser or a SoundCloud track.",
    from: ["lyrics-every-source", "karaoke"],
    media: null,
    wanted: "QuickTime, 6 s: i testi sincronizzati sul desktop e sotto la notch su una canzone famosa.",
  },
  {
    id: "screensaver",
    title: "Step away, the song stays.",
    line: "Full screen artwork and lyrics when you leave the computer, on every display, following the song.",
    from: ["screensaver", "vinyl-midnight-themes"],
    media: null,
    wanted: "QuickTime, 6 s: lo screensaver che parte con copertina e testi, e cambia con la canzone successiva.",
  },
  {
    id: "ai-playlists",
    title: "Playlists from a sentence.",
    line: "Create a playlist, find one by describing it, add tracks from text, and see which songs you keep skipping.",
    from: ["ai-playlists", "discover", "curator", "track-stats", "skip-based-removals"],
    media: null,
    wanted: "QuickTime, 8 s: Create playlist with AI dal menu del widget, una frase, la lista che si riempie, Save.",
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
  "a notch player in five themes",
  "a music screensaver",
  "AI playlists",
  "your listening stats",
  "Last.fm scrobbling",
  "Discord presence",
];

/** "a, b and c" */
export const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
