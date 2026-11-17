/**
 * Where the words go on a picture page (spec section 7): text never overlaps the child's face.
 * All rectangles are fractions of the page (0 to 1), so the same plan works at preview and print size.
 * Pure functions: tested without a browser.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = "left" | "right";

export const rectRight = (r: Rect) => r.x + r.w;
export const rectBottom = (r: Rect) => r.y + r.h;

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const h = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export const intersects = (a: Rect, b: Rect) => overlapArea(a, b) > 0;

/**
 * Detected face boxes cover the face but not the hair, hat or chin shadow, so grow them
 * (more upwards than downwards) before keeping text away.
 */
export function faceKeepOut(face: Rect, margin = 0.03): Rect {
  const up = face.h * 0.45;
  const x = Math.max(0, face.x - margin);
  const y = Math.max(0, face.y - up - margin);
  const r = Math.min(1, rectRight(face) + margin);
  const b = Math.min(1, rectBottom(face) + margin);
  return { x, y, w: r - x, h: b - y };
}

export interface PanelPlan {
  panel: Rect;
  side: Side | "bottom";
  /** Which fallback was used: 0 = the template's preferred spot. */
  attempt: number;
  /** True only if every spot touched the face: the page needs a human to look at it. */
  overlapsFace: boolean;
}

const PAGE_MARGIN = 0.04;

/** Candidate spots, best first: preferred column, other column, compact corners, then a band at the bottom. */
export function candidatePanels(preferred: Side): { panel: Rect; side: Side | "bottom" }[] {
  const col = (side: Side, w: number, h: number): Rect => ({
    x: side === "right" ? 1 - PAGE_MARGIN - w : PAGE_MARGIN,
    y: (1 - h) / 2,
    w,
    h,
  });
  const corner = (side: Side, vertical: "top" | "bottom"): Rect => ({
    x: side === "right" ? 1 - PAGE_MARGIN - 0.3 : PAGE_MARGIN,
    y: vertical === "top" ? PAGE_MARGIN : 1 - PAGE_MARGIN - 0.38,
    w: 0.3,
    h: 0.38,
  });
  const other: Side = preferred === "right" ? "left" : "right";
  return [
    { panel: col(preferred, 0.34, 0.54), side: preferred },
    { panel: col(other, 0.34, 0.54), side: other },
    { panel: corner(preferred, "top"), side: preferred },
    { panel: corner(other, "top"), side: other },
    { panel: corner(preferred, "bottom"), side: preferred },
    { panel: corner(other, "bottom"), side: other },
    { panel: { x: PAGE_MARGIN + 0.02, y: 1 - PAGE_MARGIN - 0.2, w: 1 - 2 * (PAGE_MARGIN + 0.02), h: 0.2 }, side: "bottom" },
  ];
}

export function planTextPanel(faces: readonly Rect[], preferred: Side = "right"): PanelPlan {
  const keepOut = faces.map((f) => faceKeepOut(f));
  const candidates = candidatePanels(preferred);

  for (const [attempt, c] of candidates.entries()) {
    if (!keepOut.some((k) => intersects(c.panel, k))) return { panel: c.panel, side: c.side, attempt, overlapsFace: false };
  }

  // Nothing is clear: use the spot that covers the least of the face, and say so.
  let best = 0;
  let bestOverlap = Infinity;
  for (const [i, c] of candidates.entries()) {
    const total = keepOut.reduce((s, k) => s + overlapArea(c.panel, k), 0);
    if (total < bestOverlap) {
      bestOverlap = total;
      best = i;
    }
  }
  const c = candidates[best]!;
  return { panel: c.panel, side: c.side, attempt: best, overlapsFace: true };
}

/**
 * Long names get smaller type so they fit on one line of the cover title (spec: test 20-character names).
 * Counts what a person sees (grapheme-like), not UTF-16 code units, so Devanagari is measured fairly.
 */
export function visibleLength(text: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  if (!Seg) return [...text].length;
  return [...new Seg(undefined, { granularity: "grapheme" }).segment(text)].length;
}

export function nameFontScale(name: string): number {
  const n = visibleLength(name.trim());
  if (n <= 10) return 1;
  return Math.max(0.5, 10 / n);
}

/**
 * A picture is placed on the page with "cover" fitting: scaled until it fills the page, centred, and the
 * overflow is trimmed. A face box measured on the original picture must be moved to where it lands on the page.
 */
export function mapRectToPage(r: Rect, imageAspect: number, pageAspect: number): Rect {
  if (Math.abs(imageAspect - pageAspect) < 1e-9) return { ...r };
  if (imageAspect > pageAspect) {
    // Picture is wider than the page: the left and right edges are trimmed.
    const trim = (1 - pageAspect / imageAspect) / 2;
    const scale = 1 / (1 - 2 * trim);
    return { x: (r.x - trim) * scale, y: r.y, w: r.w * scale, h: r.h };
  }
  // Picture is taller than the page: the top and bottom are trimmed.
  const trim = (1 - imageAspect / pageAspect) / 2;
  const scale = 1 / (1 - 2 * trim);
  return { x: r.x, y: (r.y - trim) * scale, w: r.w, h: r.h * scale };
}
