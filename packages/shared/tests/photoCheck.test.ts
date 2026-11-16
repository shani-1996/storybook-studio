import { describe, expect, it } from "vitest";
import {
  PHOTO_CHECK_DEFAULTS,
  PHOTO_FAIL_REASONS,
  cosineSimilarity,
  evaluateFaces,
  faceWidthFraction,
  likelihoodAtLeast,
  minPairwiseSimilarity,
  photosAreSameChild,
  type VisionFace,
} from "../src/photoCheck.js";

const W = 1000;
/** A good face: 30% of the image width, confident, sharp, well lit, facing the camera. */
const good = (over: Partial<VisionFace> = {}): VisionFace => ({
  boundingPoly: { vertices: [{ x: 300, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 500 }, { x: 300, y: 500 }] },
  detectionConfidence: 0.97,
  rollAngle: 3,
  tiltAngle: -4,
  panAngle: 5,
  blurredLikelihood: "VERY_UNLIKELY",
  underExposedLikelihood: "UNLIKELY",
  headwearLikelihood: "VERY_UNLIKELY",
  ...over,
});

describe("evaluateFaces", () => {
  it("accepts a good photo", () => {
    const r = evaluateFaces([good()], W);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.widthFraction).toBeCloseTo(0.3);
  });
  it("NO_FACE when nothing detected", () => {
    expect(evaluateFaces([], W)).toEqual({ ok: false, reason: "NO_FACE" });
  });
  it("MULTIPLE_FACES when more than one", () => {
    expect(evaluateFaces([good(), good()], W)).toEqual({ ok: false, reason: "MULTIPLE_FACES" });
  });
  it("FACE_TOO_SMALL under 15% of the width, ok at exactly 15%", () => {
    const poly = (w: number) => ({ vertices: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: 100 }, { x: 0, y: 100 }] });
    expect(evaluateFaces([good({ boundingPoly: poly(149) })], W)).toEqual({ ok: false, reason: "FACE_TOO_SMALL" });
    expect(evaluateFaces([good({ boundingPoly: poly(150) })], W).ok).toBe(true);
  });
  it("LOW_CONFIDENCE under 0.8, ok at 0.8", () => {
    expect(evaluateFaces([good({ detectionConfidence: 0.79 })], W)).toEqual({ ok: false, reason: "LOW_CONFIDENCE" });
    expect(evaluateFaces([good({ detectionConfidence: 0.8 })], W).ok).toBe(true);
  });
  it("BLURRY at LIKELY or higher, not at POSSIBLE", () => {
    expect(evaluateFaces([good({ blurredLikelihood: "LIKELY" })], W)).toEqual({ ok: false, reason: "BLURRY" });
    expect(evaluateFaces([good({ blurredLikelihood: "VERY_LIKELY" })], W)).toEqual({ ok: false, reason: "BLURRY" });
    expect(evaluateFaces([good({ blurredLikelihood: "POSSIBLE" })], W).ok).toBe(true);
  });
  it("UNDER_EXPOSED at LIKELY or higher", () => {
    expect(evaluateFaces([good({ underExposedLikelihood: "LIKELY" })], W)).toEqual({ ok: false, reason: "UNDER_EXPOSED" });
  });
  it("HEAD_TILTED when roll or tilt is over 25 degrees, either direction", () => {
    for (const over of [{ rollAngle: 26 }, { rollAngle: -26 }, { tiltAngle: 26 }, { tiltAngle: -30 }]) {
      expect(evaluateFaces([good(over)], W)).toEqual({ ok: false, reason: "HEAD_TILTED" });
    }
    expect(evaluateFaces([good({ rollAngle: 25, tiltAngle: -25 })], W).ok).toBe(true);
  });
  it("HEADWEAR at LIKELY or higher", () => {
    expect(evaluateFaces([good({ headwearLikelihood: "VERY_LIKELY" })], W)).toEqual({ ok: false, reason: "HEADWEAR" });
  });
  it("UNKNOWN likelihood never fails a photo", () => {
    expect(evaluateFaces([good({ blurredLikelihood: "UNKNOWN", headwearLikelihood: "UNKNOWN" })], W).ok).toBe(true);
    expect(likelihoodAtLeast(undefined, "LIKELY")).toBe(false);
  });
  it("reports the most useful reason first when several apply", () => {
    const bad = good({ blurredLikelihood: "VERY_LIKELY", headwearLikelihood: "VERY_LIKELY", rollAngle: 40 });
    expect(evaluateFaces([bad], W)).toEqual({ ok: false, reason: "BLURRY" });
  });
  it("thresholds come from config", () => {
    const strict = { ...PHOTO_CHECK_DEFAULTS, minFaceWidthFraction: 0.5 };
    expect(evaluateFaces([good()], W, strict)).toEqual({ ok: false, reason: "FACE_TOO_SMALL" });
  });
  it("handles a missing bounding box and zero width safely", () => {
    expect(faceWidthFraction({}, W)).toBe(0);
    expect(faceWidthFraction(good(), 0)).toBe(0);
  });
});

describe("similarity", () => {
  it("cosine of identical, orthogonal and opposite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it("rejects mismatched or zero vectors", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
    expect(() => cosineSimilarity([0, 0], [1, 1])).toThrow();
    expect(() => cosineSimilarity([], [])).toThrow();
  });
  it("min pairwise picks the weakest pair", () => {
    expect(minPairwiseSimilarity([[1, 0], [1, 0.1], [0, 1]])).toBeCloseTo(0);
  });
  it("same child needs every pair at or above 0.45", () => {
    expect(photosAreSameChild([[1, 0], [1, 0.2], [1, -0.2]])).toBe(true);
    expect(photosAreSameChild([[1, 0], [0, 1], [1, 1]])).toBe(false);
    expect(photosAreSameChild([[1, 0]])).toBe(true); // nothing to compare yet
  });
});

describe("reason codes", () => {
  it("every reason has a unique code", () => {
    expect(new Set(PHOTO_FAIL_REASONS).size).toBe(PHOTO_FAIL_REASONS.length);
  });
});
