import type { Candidate, LimitsConfig } from "./schemas.js";

/** Map cosine similarity to 0..1 using the pass threshold as the floor. */
export function normaliseFace(similarity: number, faceScoreMin: number): number {
  const span = 1 - faceScoreMin;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (similarity - faceScoreMin) / span));
}

export function hardFail(c: Candidate): boolean {
  const j = c.judge;
  if (!j) return true;
  return j.extra_limbs || j.extra_children || j.text_in_image || !j.hands_ok;
}

export function evaluate(c: Candidate, limits: LimitsConfig): Candidate {
  const face = c.faceScore ?? -1;
  const judgeScore = c.judge?.score ?? 0;
  const passed = face >= limits.faceScoreMin && judgeScore >= limits.judgeScoreMin && !hardFail(c);
  // Spec: 0.6 x normalised face + 0.4 x judge (judge scaled to 0..1)
  const combined = 0.6 * normaliseFace(face, limits.faceScoreMin) + 0.4 * (judgeScore / 10);
  return { ...c, passed, combined };
}

export function selectBest(candidates: Candidate[]): Candidate | null {
  const passing = candidates.filter((c) => c.passed);
  if (passing.length === 0) return null;
  return passing.reduce((best, c) => ((c.combined ?? 0) > (best.combined ?? 0) ? c : best));
}
