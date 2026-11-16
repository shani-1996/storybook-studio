/**
 * Photo check rules (spec section 6, step 1). Pure functions so they are unit-tested without any cloud call.
 * Input is the subset of Cloud Vision face detection we use. Thresholds live in config (these are the defaults).
 */

export type Likelihood = "UNKNOWN" | "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";

export interface VisionVertex {
  x?: number;
  y?: number;
}

export interface VisionFace {
  boundingPoly?: { vertices?: VisionVertex[] };
  detectionConfidence?: number;
  rollAngle?: number;
  panAngle?: number;
  tiltAngle?: number;
  blurredLikelihood?: Likelihood;
  underExposedLikelihood?: Likelihood;
  headwearLikelihood?: Likelihood;
}

export const PHOTO_FAIL_REASONS = [
  "NO_FACE",
  "MULTIPLE_FACES",
  "FACE_TOO_SMALL",
  "LOW_CONFIDENCE",
  "BLURRY",
  "UNDER_EXPOSED",
  "HEAD_TILTED",
  "HEADWEAR",
  "DIFFERENT_CHILD",
  "UNREADABLE",
  "CHECK_FAILED",
] as const;
export type PhotoFailReason = (typeof PHOTO_FAIL_REASONS)[number];

export interface PhotoCheckConfig {
  minFaceWidthFraction: number; // face width / image width
  minDetectionConfidence: number;
  maxHeadAngleDegrees: number; // roll and tilt
  badLikelihoodAtOrAbove: Likelihood; // blur, exposure, headwear
  minPhotoSimilarity: number; // cosine between any two photos of the same child
  maxLongEdgePx: number;
}

export const PHOTO_CHECK_DEFAULTS: PhotoCheckConfig = {
  minFaceWidthFraction: 0.15,
  minDetectionConfidence: 0.8,
  maxHeadAngleDegrees: 25,
  badLikelihoodAtOrAbove: "LIKELY",
  minPhotoSimilarity: 0.45,
  maxLongEdgePx: 2048,
};

const ORDER: Likelihood[] = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"];

export function likelihoodAtLeast(value: Likelihood | undefined, threshold: Likelihood): boolean {
  if (!value || value === "UNKNOWN") return false; // unknown never fails a photo
  return ORDER.indexOf(value) >= ORDER.indexOf(threshold);
}

export function faceWidthFraction(face: VisionFace, imageWidth: number): number {
  const xs = (face.boundingPoly?.vertices ?? []).map((v) => v.x ?? 0);
  if (xs.length === 0 || imageWidth <= 0) return 0;
  return (Math.max(...xs) - Math.min(...xs)) / imageWidth;
}

export type FaceCheckResult =
  | { ok: true; face: VisionFace; widthFraction: number }
  | { ok: false; reason: PhotoFailReason };

/** Checks run in a fixed order so the parent always sees the most useful single reason first. */
export function evaluateFaces(
  faces: VisionFace[],
  imageWidth: number,
  cfg: PhotoCheckConfig = PHOTO_CHECK_DEFAULTS,
): FaceCheckResult {
  if (faces.length === 0) return { ok: false, reason: "NO_FACE" };
  if (faces.length > 1) return { ok: false, reason: "MULTIPLE_FACES" };
  const face = faces[0] as VisionFace;

  const widthFraction = faceWidthFraction(face, imageWidth);
  if (widthFraction < cfg.minFaceWidthFraction) return { ok: false, reason: "FACE_TOO_SMALL" };
  if ((face.detectionConfidence ?? 0) < cfg.minDetectionConfidence) return { ok: false, reason: "LOW_CONFIDENCE" };
  if (likelihoodAtLeast(face.blurredLikelihood, cfg.badLikelihoodAtOrAbove)) return { ok: false, reason: "BLURRY" };
  if (likelihoodAtLeast(face.underExposedLikelihood, cfg.badLikelihoodAtOrAbove)) return { ok: false, reason: "UNDER_EXPOSED" };
  if (Math.abs(face.rollAngle ?? 0) > cfg.maxHeadAngleDegrees || Math.abs(face.tiltAngle ?? 0) > cfg.maxHeadAngleDegrees) {
    return { ok: false, reason: "HEAD_TILTED" };
  }
  if (likelihoodAtLeast(face.headwearLikelihood, cfg.badLikelihoodAtOrAbove)) return { ok: false, reason: "HEADWEAR" };

  return { ok: true, face, widthFraction };
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error("embeddings must have the same non-zero length");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) throw new Error("zero-length embedding");
  return dot / Math.sqrt(na * nb);
}

/** Lowest similarity between any two photos; all photos must show the same child. */
export function minPairwiseSimilarity(embeddings: readonly (readonly number[])[]): number {
  let lowest = 1;
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      lowest = Math.min(lowest, cosineSimilarity(embeddings[i] as number[], embeddings[j] as number[]));
    }
  }
  return lowest;
}

export function photosAreSameChild(embeddings: readonly (readonly number[])[], cfg: PhotoCheckConfig = PHOTO_CHECK_DEFAULTS): boolean {
  return embeddings.length < 2 || minPairwiseSimilarity(embeddings) >= cfg.minPhotoSimilarity;
}
