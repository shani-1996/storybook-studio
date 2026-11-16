import { describe, expect, it } from "vitest";
import { generatePage } from "../src/pipeline.js";
import { estimateCostUsd } from "../src/cost.js";
import { makeDeps, template } from "./helpers.js";

const child = { firstName: "Zoe", gender: "girl", age: 5 } as const;
const photos = [{ base64: "p", mimeType: "image/jpeg" }];

describe("generatePage", () => {
  it("selects a passing candidate", async () => {
    const r = await generatePage(makeDeps(), child, template, photos);
    expect(r.candidates).toHaveLength(3);
    expect(r.selected).not.toBeNull();
    expect(r.blocked).toBe(false);
  });
  it("retries once on a blocked response then succeeds", async () => {
    let calls = 0;
    const deps = makeDeps({
      images: { generate: async () => (++calls === 1 ? null : { base64: "A", mimeType: "image/png", usage: { inputTokens: 1, outputTokens: 1 } }) },
      models: { ...makeDeps().models, candidatesPerPage: 1 },
    });
    const r = await generatePage(deps, child, template, photos);
    expect(calls).toBe(2);
    expect(r.selected).not.toBeNull();
  });
  it("marks blocked when every attempt returns no image", async () => {
    const deps = makeDeps({ images: { generate: async () => null } });
    const r = await generatePage(deps, child, template, photos);
    expect(r.blocked).toBe(true);
    expect(r.selected).toBeNull();
  });
  it("treats a multi-face result as failing likeness", async () => {
    const deps = makeDeps({ faces: { compare: async () => ({ similarity: 0.9, faces: 2, largestFaceWidthFraction: 0.2 }) } });
    expect((await generatePage(deps, child, template, photos)).selected).toBeNull();
  });
});

describe("estimateCostUsd", () => {
  it("returns null when prices are unset", () => {
    expect(estimateCostUsd({ inputTokens: 1, outputTokens: 1 }, makeDeps().models)).toBeNull();
  });
  it("computes cost from configured prices", () => {
    const m = { ...makeDeps().models, usdPerMillionInputTokens: 2, usdPerMillionOutputTokens: 10 };
    expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, m)).toBe(12);
  });
});
