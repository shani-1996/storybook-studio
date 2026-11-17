import { mapRectToPage, nameFontScale, planTextPanel, type PanelPlan, type Rect, type Side } from "./layout.js";

/** Trim size: 11 x 8.5 in landscape (decisions.md). All sizes below are fractions of the page width. */
export const PAGE_ASPECT = 11 / 8.5;
export const pageHeightFor = (widthPx: number) => Math.round(widthPx / PAGE_ASPECT);

/** Type sizes as a fraction of page width. 0.028 of an 11 in page is about 22 pt (never below 16 pt = 0.0202). */
export const TYPE = { rhyme: 0.028, fact: 0.034, motivation: 0.032, title: 0.04, coverName: 0.07, coverSmall: 0.04, minReadable: 0.0202 } as const;

export interface PicturePageSpec {
  kind: "art";
  /** Picture as shown, plus the detected face boxes (fractions of the picture itself). */
  image: { url: string; width: number; height: number; faces: Rect[] };
  textSide: Side;
  title: string;
  lines: string[];
  watermark: boolean;
  widthPx: number;
}

export interface TextPageSpec {
  kind: "text";
  title: string;
  fact: string;
  motivation: string;
  watermark: boolean;
  widthPx: number;
}

export interface CoverPageSpec {
  kind: "cover";
  image: { url: string; width: number; height: number; faces: Rect[] };
  textSide: Side;
  name: string;
  watermark: boolean;
  widthPx: number;
}

export type PageSpec = PicturePageSpec | TextPageSpec | CoverPageSpec;

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** One poem line as HTML. Words joined by a hyphen ("thump-thump") never split across two lines. */
export function lineHtml(line: string): string {
  return line
    .split(" ")
    .map((word) => (word.includes("-") ? `<span style="white-space:nowrap">${escapeHtml(word)}</span>` : escapeHtml(word)))
    .join(" ");
}

export const ASSET_HOST = "https://assets.local";

const FONT_CSS = `
@font-face { font-family: "Andika"; src: url(${ASSET_HOST}/fonts/Andika-Regular.ttf); font-weight: 400; }
@font-face { font-family: "Andika"; src: url(${ASSET_HOST}/fonts/Andika-Bold.ttf); font-weight: 700; }
@font-face { font-family: "Fredoka"; src: url(${ASSET_HOST}/fonts/Fredoka-Variable.ttf); font-weight: 300 700; }
@font-face { font-family: "Noto Sans Devanagari"; src: url(${ASSET_HOST}/fonts/NotoSansDevanagari-Variable.ttf); font-weight: 100 900; }
`;

/** Diagonal PREVIEW pattern for the free preview (spec: preview images are watermarked). */
const WATERMARK_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><text x="210" y="140" text-anchor="middle" transform="rotate(-24 210 130)" font-family="sans-serif" font-weight="700" font-size="54" fill="rgba(255,255,255,0.5)" stroke="rgba(0,0,0,0.18)" stroke-width="1.5">PREVIEW</text></svg>`,
);

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

const baseCss = (w: number, h: number) => `
${FONT_CSS}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
.page { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; font-family: "Andika", "Noto Sans Devanagari", sans-serif; color: #3b3530; }
.page img.art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.region { position: absolute; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.panel { width: 100%; max-height: 100%; background: rgba(255, 252, 246, 0.88); border-radius: ${(w * 0.02).toFixed(1)}px; padding: ${(w * 0.016).toFixed(1)}px ${(w * 0.02).toFixed(1)}px; text-align: center; overflow: hidden; }
.title { font-family: "Fredoka", "Noto Sans Devanagari", sans-serif; font-weight: 600; letter-spacing: 0.04em; color: #2f6f6b; margin: 0 0 ${(w * 0.008).toFixed(1)}px; }
.fit { line-height: 1.25; }
/* Each poem line is its own block with a gap, so a line that wraps is not mistaken for a new line. */
.fit div { margin: 0 0 0.5em; text-wrap: balance; }
.fit div:last-child { margin-bottom: 0; }
.watermark { position: absolute; inset: 0; background-image: url("data:image/svg+xml,${WATERMARK_SVG}"); background-repeat: repeat; pointer-events: none; }
`;

export interface BuiltPage {
  html: string;
  width: number;
  height: number;
  /** Where the words were put (picture and cover pages only). */
  plan?: PanelPlan;
}

function watermarkHtml(on: boolean) {
  return on ? `<div class="watermark"></div>` : "";
}

export function buildPage(spec: PageSpec): BuiltPage {
  const w = spec.widthPx;
  const h = pageHeightFor(w);

  if (spec.kind === "text") {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(w, h)}
.paper { position: absolute; inset: 0; background: radial-gradient(ellipse at 20% 15%, #fff8e8 0%, #fbeed2 60%, #f5e3bd 100%); }
.frame { position: absolute; inset: ${(w * 0.03).toFixed(1)}px; border: ${(w * 0.004).toFixed(1)}px dashed rgba(47,111,107,0.45); border-radius: ${(w * 0.03).toFixed(1)}px; }
.col { position: absolute; left: ${pct(0.12)}; right: ${pct(0.12)}; top: ${pct(0.12)}; bottom: ${pct(0.12)}; display: flex; flex-direction: column; justify-content: center; gap: ${(w * 0.03).toFixed(1)}px; text-align: center; }
.fact-label { font-family: "Fredoka", sans-serif; font-weight: 600; color: #c0612b; font-size: ${(w * TYPE.title).toFixed(1)}px; }
.fact { font-size: ${(w * TYPE.fact).toFixed(1)}px; }
.motivation { font-family: "Fredoka", "Noto Sans Devanagari", sans-serif; font-weight: 500; color: #2f6f6b; font-size: ${(w * TYPE.motivation).toFixed(1)}px; }
</style></head><body><div class="page" data-kind="text">
<div class="paper"></div><div class="frame"></div>
<div class="col"><div class="fact-label">Did you know?</div>
<div class="fit fact" data-fit data-base="${(w * TYPE.fact).toFixed(1)}">${escapeHtml(spec.fact)}</div>
<div class="fit motivation" data-fit data-base="${(w * TYPE.motivation).toFixed(1)}">${escapeHtml(spec.motivation)}</div></div>
${watermarkHtml(spec.watermark)}</div></body></html>`;
    return { html, width: w, height: h };
  }

  const pageAspect = PAGE_ASPECT;
  const faces = spec.image.faces.map((f) => mapRectToPage(f, spec.image.width / spec.image.height, pageAspect));
  const plan = planTextPanel(faces, spec.textSide);
  const p = plan.panel;
  const panelStyle = `left:${pct(p.x)}; top:${pct(p.y)}; width:${pct(p.w)}; height:${pct(p.h)};`;

  if (spec.kind === "art") {
    const lines = spec.lines.map((l) => `<div>${lineHtml(l)}</div>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(w, h)}
.title { font-size: ${(w * TYPE.title).toFixed(1)}px; }
.fit { font-size: ${(w * TYPE.rhyme).toFixed(1)}px; }
</style></head><body><div class="page" data-kind="art">
<img class="art" src="${spec.image.url}" alt="">
<div class="region" style="${panelStyle}"><div class="panel"><div class="title" data-fit data-base="${(w * TYPE.title).toFixed(1)}" data-nowrap>${escapeHtml(spec.title.toUpperCase())}</div>
<div class="fit" data-fit data-base="${(w * TYPE.rhyme).toFixed(1)}">${lines}</div></div></div>
${watermarkHtml(spec.watermark)}</div></body></html>`;
    return { html, width: w, height: h, plan };
  }

  // Cover: "When", the child's name on one line (smaller if long), "Grows Up".
  const nameScale = nameFontScale(spec.name);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(w, h)}
.cover-small { font-family: "Fredoka", sans-serif; font-weight: 600; color: #2f6f6b; font-size: ${(w * TYPE.coverSmall).toFixed(1)}px; letter-spacing: 0.06em; }
.cover-name { font-family: "Fredoka", "Noto Sans Devanagari", sans-serif; font-weight: 700; color: #c0612b; white-space: nowrap; line-height: 1.15; }
</style></head><body><div class="page" data-kind="cover">
<img class="art" src="${spec.image.url}" alt="">
<div class="region" style="${panelStyle}"><div class="panel"><div class="cover-small">WHEN</div>
<div class="cover-name" data-fit data-base="${(w * TYPE.coverName * nameScale).toFixed(1)}" data-nowrap>${escapeHtml(spec.name)}</div>
<div class="cover-small">GROWS UP</div></div></div>
${watermarkHtml(spec.watermark)}</div></body></html>`;
  return { html, width: w, height: h, plan };
}

/**
 * Runs inside the page: for each panel, shrinks all of its text together until it fits, never below the readable
 * minimum (16 pt). Reports what happened so the caller can flag a page that still overflows.
 */
export function fitScript(minPx: number): string {
  return `
(() => {
  const minPx = ${minPx};
  const groups = new Map();
  for (const el of document.querySelectorAll('[data-fit]')) {
    const box = el.closest('.region, .col') || el.parentElement;
    if (!groups.has(box)) groups.set(box, []);
    groups.get(box).push(el);
  }
  const report = [];
  for (const [box, els] of groups) {
    const bases = els.map((e) => parseFloat(e.dataset.base));
    let scale = 1;
    const apply = () => els.forEach((e, i) => { e.style.fontSize = (bases[i] * scale) + 'px'; });
    // Too tall for the spot, or a one-line item (a name) wider than the writing area inside the panel's padding.
    const panel = box.querySelector('.panel') || box;
    const cs = getComputedStyle(panel);
    const inner = panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const over = () =>
      box.scrollHeight > box.clientHeight + 1 ||
      panel.scrollHeight > box.clientHeight + 1 ||
      els.some((e) => e.dataset.nowrap !== undefined && e.scrollWidth > inner + 1);
    apply();
    while (over() && bases.every((b) => b * scale * 0.96 >= minPx)) { scale *= 0.96; apply(); }
    els.forEach((e, i) => report.push({ text: e.textContent.trim().slice(0, 24), scale, fontPx: bases[i] * scale, overflow: over() }));
  }
  return report;
})()
`;
}
