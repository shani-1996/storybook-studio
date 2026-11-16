import { describe, expect, it } from "vitest";
import { evaluate, normaliseFace, selectBest } from "../src/scoring.js";
import type { Candidate } from "../src/schemas.js";
import { goodJudge } from "./helpers.js";

const limits = { faceScoreMin: 0.4, judgeScoreMin: 7 };
const base = (o: Partial<Candidate>): Candidate => ({
  id: "x", imageBase64: "", mimeType: "image/png", model: "m", promptHash: "h", latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0 }, costUsd: null, ...o,
});

describe("scoring", () => {
  it("normalises face score between the threshold and 1", () => {
    expect(normaliseFace(0.4, 0.4)).toBe(0);
    expect(normaliseFace(1, 0.4)).toBe(1);
    expect(normaliseFace(0.2, 0.4)).toBe(0);
  });
  it("fails below face threshold", () => {
    expect(evaluate(base({ faceScore: 0.3, judge: goodJudge }), limits).passed).toBe(false);
  });
  it("fails on a hard defect even with a high score", () => {
    const j = { ...goodJudge, extra_children: true };
    expect(evaluate(base({ faceScore: 0.9, judge: j }), limits).passed).toBe(false);
  });
  it("fails when the judge score is low", () => {
    expect(evaluate(base({ faceScore: 0.9, judge: { ...goodJudge, score: 5 } }), limits).passed).toBe(false);
  });
  it("selects the best combined among passing candidates", () => {
    const a = evaluate(base({ id: "a", faceScore: 0.5, judge: goodJudge }), limits);
    const b = evaluate(base({ id: "b", faceScore: 0.8, judge: goodJudge }), limits);
    const c = evaluate(base({ id: "c", faceScore: 0.95, judge: { ...goodJudge, extra_limbs: true } }), limits);
    expect(selectBest([a, b, c])?.id).toBe("b");
  });
  it("returns null when nothing passes", () => {
    expect(selectBest([evaluate(base({ faceScore: 0.1, judge: goodJudge }), limits)])).toBeNull();
  });
});
