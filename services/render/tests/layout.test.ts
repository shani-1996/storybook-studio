import { describe, expect, it } from "vitest";
import { candidatePanels, faceKeepOut, intersects, nameFontScale, overlapArea, planTextPanel, rectBottom, rectRight, visibleLength, type Rect } from "../src/layout.js";

const face = (x: number, y: number, w = 0.2, h = 0.25): Rect => ({ x, y, w, h });

describe("rect maths", () => {
  it("overlap area of overlapping, touching and apart rectangles", () => {
    expect(overlapArea({ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toBeCloseTo(0.0625);
    expect(overlapArea({ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 })).toBe(0);
    expect(intersects({ x: 0, y: 0, w: 0.1, h: 0.1 }, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 })).toBe(false);
  });
});

describe("faceKeepOut", () => {
  it("grows the face box, more upwards (hair) than downwards", () => {
    const f = face(0.3, 0.3);
    const k = faceKeepOut(f);
    expect(k.x).toBeLessThan(f.x);
    expect(f.y - k.y).toBeGreaterThan(rectBottom(k) - rectBottom(f));
  });
  it("never leaves the page", () => {
    const k = faceKeepOut(face(0, 0, 1, 1));
    expect(k.x).toBeGreaterThanOrEqual(0);
    expect(k.y).toBeGreaterThanOrEqual(0);
    expect(rectRight(k)).toBeLessThanOrEqual(1);
    expect(rectBottom(k)).toBeLessThanOrEqual(1);
  });
});

describe("planTextPanel", () => {
  it("uses the preferred side when the face is on the other side", () => {
    const plan = planTextPanel([face(0.15, 0.3)], "right");
    expect(plan.side).toBe("right");
    expect(plan.attempt).toBe(0);
    expect(plan.overlapsFace).toBe(false);
  });
  it("moves to the other side when the face is where the text wanted to be", () => {
    const plan = planTextPanel([face(0.7, 0.3)], "right");
    expect(plan.side).toBe("left");
    expect(plan.overlapsFace).toBe(false);
  });
  it("respects a left preference too", () => {
    expect(planTextPanel([face(0.7, 0.3)], "left").side).toBe("left");
    expect(planTextPanel([face(0.1, 0.3)], "left").side).toBe("right");
  });
  it("falls back to a corner or the bottom band for a big centred face", () => {
    const plan = planTextPanel([face(0.28, 0.1, 0.44, 0.5)], "right");
    expect(plan.overlapsFace).toBe(false);
    expect(plan.attempt).toBeGreaterThan(1);
  });
  it("never returns a panel that touches the grown face when it reports a clear spot", () => {
    for (let x = 0; x <= 0.8; x += 0.1) {
      for (let y = 0; y <= 0.7; y += 0.1) {
        const f = face(x, y);
        const plan = planTextPanel([f], "right");
        if (!plan.overlapsFace) expect(intersects(plan.panel, faceKeepOut(f))).toBe(false);
      }
    }
  });
  it("flags the page for a human when no spot is clear", () => {
    const plan = planTextPanel([face(0.02, 0.02, 0.96, 0.96)], "right");
    expect(plan.overlapsFace).toBe(true);
  });
  it("keeps clear of every face when there are several", () => {
    const faces = [face(0.1, 0.3), face(0.7, 0.3)];
    const plan = planTextPanel(faces, "right");
    if (!plan.overlapsFace) for (const f of faces) expect(intersects(plan.panel, faceKeepOut(f))).toBe(false);
  });
  it("every candidate stays on the page", () => {
    for (const side of ["left", "right"] as const) {
      for (const c of candidatePanels(side)) {
        expect(c.panel.x).toBeGreaterThanOrEqual(0);
        expect(c.panel.y).toBeGreaterThanOrEqual(0);
        expect(rectRight(c.panel)).toBeLessThanOrEqual(1);
        expect(rectBottom(c.panel)).toBeLessThanOrEqual(1);
      }
    }
  });
  it("with no faces the preferred spot is used", () => {
    expect(planTextPanel([], "left")).toMatchObject({ side: "left", attempt: 0, overlapsFace: false });
  });
});

describe("name sizing", () => {
  it("full size up to 10 visible characters", () => {
    expect(nameFontScale("Zoe")).toBe(1);
    expect(nameFontScale("A".repeat(10))).toBe(1);
  });
  it("shrinks for longer names, never below half", () => {
    expect(nameFontScale("A".repeat(20))).toBeCloseTo(0.5);
    expect(nameFontScale("A".repeat(15))).toBeCloseTo(10 / 15);
    expect(nameFontScale("A".repeat(40))).toBe(0.5);
  });
  it("counts what a person sees, so Devanagari is not over-counted", () => {
    const name = "आरव"; // three letters
    expect(visibleLength(name)).toBeLessThanOrEqual(3);
    expect(nameFontScale(name)).toBe(1);
    const conjunct = "क्षितिज"; // several code points, fewer visible characters
    expect(visibleLength(conjunct)).toBeLessThan([...conjunct].length);
  });
  it("ignores surrounding spaces", () => {
    expect(nameFontScale("  Zoe  ")).toBe(1);
  });
});

import { mapRectToPage } from "../src/layout.js";

describe("mapRectToPage (picture trimmed to fit the page)", () => {
  it("leaves the box alone when the shapes match", () => {
    expect(mapRectToPage({ x: 0.2, y: 0.3, w: 0.1, h: 0.2 }, 1.3, 1.3)).toEqual({ x: 0.2, y: 0.3, w: 0.1, h: 0.2 });
  });
  it("a wider picture loses its sides: a box in the middle stays in the middle and gets wider", () => {
    const r = mapRectToPage({ x: 0.4, y: 0.3, w: 0.2, h: 0.2 }, 1.339, 1.294);
    expect(r.x + r.w / 2).toBeCloseTo(0.5, 5);
    expect(r.w).toBeGreaterThan(0.2);
    expect(r.y).toBe(0.3);
    expect(r.h).toBe(0.2);
  });
  it("a box at the trimmed edge ends up partly off the page", () => {
    const r = mapRectToPage({ x: 0, y: 0.3, w: 0.05, h: 0.2 }, 1.5, 1.0);
    expect(r.x).toBeLessThan(0);
  });
  it("a taller picture loses its top and bottom", () => {
    const r = mapRectToPage({ x: 0.3, y: 0.4, w: 0.2, h: 0.2 }, 1.0, 1.5);
    expect(r.y + r.h / 2).toBeCloseTo(0.5, 5);
    expect(r.h).toBeGreaterThan(0.2);
    expect(r.x).toBe(0.3);
    expect(r.w).toBe(0.2);
  });
  it("a full-picture box maps to the whole page", () => {
    const r = mapRectToPage({ x: 0, y: 0, w: 1, h: 1 }, 1.339, 1.294);
    expect(r.x).toBeLessThan(0);
    expect(r.x + r.w).toBeGreaterThan(1);
  });
});
