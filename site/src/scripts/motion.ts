// Il movimento della home (24/10/2026, seconda passata sul modello di iBaila). Valori presi dal loro
// bundle (vedi .study/NOTE.md nel worktree della PR):
//  - Lenis 1.3.26 con lerp .11 e wheelMultiplier .95, spento con "Riduci movimento" e sui
//    puntatori grossolani (telefono, tablet): li' resta lo scorrimento nativo;
//  - titoli parola per parola: ogni parola sale dal 105% con 4 gradi di rotazione, 1,1 s, .07 s
//    fra una e l'altra, curva "glide" (.16, 1, .3, 1);
//  - il resto entra sfocato (blur 10px), dal basso, opacita' 0 -> 1, sfalsato per elemento;
//  - le cornici accese (.lf) "si accendono" quando entrano: la luce cresce (CSS, .is-in).
// Senza JavaScript tutto e' visibile: lo stato nascosto esiste solo con .js-reveal su <html>.
import Lenis from "lenis";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;
const root = document.documentElement;

// ── Scorrimento ──────────────────────────────────────────────────────────────
if (!reduce && !coarse) {
  const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95, anchors: { offset: -20 } });
  const raf = (t: number) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
}

// ── Titoli parola per parola ─────────────────────────────────────────────────
// Lo split avviene qui e non nel markup: l'HTML della home resta leggero e i lettori di schermo
// leggono il titolo intero (aria-label sul titolo, parole aria-hidden).
function splitWords(el: HTMLElement) {
  if (el.dataset.split) return;
  el.dataset.split = "1";
  el.setAttribute("aria-label", el.textContent?.replace(/\s+/g, " ").trim() ?? "");
  let n = 0;
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? "").split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(document.createTextNode(" ")); continue; }
          const mask = document.createElement("span");
          mask.className = "w-mask";
          mask.setAttribute("aria-hidden", "true");
          const w = document.createElement("span");
          w.className = "w";
          w.style.setProperty("--w", String(n++));
          w.textContent = part;
          mask.append(w);
          frag.append(mask);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(el);
}

if (!reduce && "IntersectionObserver" in window) {
  document.querySelectorAll<HTMLElement>("[data-words]").forEach(splitWords);
  root.classList.add("js-reveal");

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0 });

  const fold = window.innerHeight;
  document.querySelectorAll<HTMLElement>("[data-words], [data-reveal], [data-steps]").forEach((el) => {
    // Quello che e' gia' sullo schermo all'apertura parte subito (con il suo ritardo).
    if (el.hasAttribute("data-words-now") || el.getBoundingClientRect().top < fold * 0.92) {
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in")));
    } else io.observe(el);
  });
}

// ── Hero che si allontana scorrendo (iBaila: y 0 -> -90 px su 500 px, opacita' 1 -> 0 su 420) ──
const copy = document.querySelector<HTMLElement>("[data-hero-copy]");
if (copy && !reduce && window.matchMedia("(min-width: 1024px)").matches) {
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = Math.min(window.scrollY, 600);
    copy.style.transform = `translate3d(0, ${(-90 * Math.min(y, 500)) / 500}px, 0)`;
    copy.style.opacity = String(Math.max(0, 1 - y / 520));
  };
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
}

// ── Torcia: un alone morbido che segue il mouse (solo puntatori fini) ──
const torch = document.getElementById("torch");
if (torch && !reduce && window.matchMedia("(pointer: fine)").matches) {
  let tx = window.innerWidth / 2, ty = window.innerHeight / 3, x = tx, y = ty, raf = 0;
  const step = () => {
    x += (tx - x) * 0.12; y += (ty - y) * 0.12;
    torch.style.transform = `translate3d(${x - 400}px, ${y - 400}px, 0)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(step) : 0;
  };
  window.addEventListener("pointermove", (e) => {
    tx = e.clientX; ty = e.clientY; torch.style.opacity = "1";
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: true });
  document.addEventListener("pointerleave", () => { torch.style.opacity = "0"; });
}

// ── Card dei marchi: il bordo si accende sotto il mouse (lit-card di iBaila) ──
document.querySelectorAll<HTMLElement>(".brand-card").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});
