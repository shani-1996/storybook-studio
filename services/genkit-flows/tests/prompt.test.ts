import { describe, expect, it } from "vitest";
import { buildPagePrompt, promptHash } from "../src/prompt.js";
import { template } from "./helpers.js";

describe("buildPagePrompt", () => {
  const child = { firstName: "Zoe", gender: "girl", age: 5 } as const;
  it("never includes the child's name", () => {
    expect(buildPagePrompt(child, template)).not.toContain("Zoe");
  });
  it("uses gender-specific outfit and age", () => {
    const p = buildPagePrompt(child, template);
    expect(p).toContain("hair clips");
    expect(p).toContain("5-year-old");
  });
  it("includes the fixed rules", () => {
    expect(buildPagePrompt(child, template)).toContain("No text, letters");
  });
  it("hashes deterministically", () => {
    expect(promptHash("a")).toBe(promptHash("a"));
    expect(promptHash("a")).not.toBe(promptHash("b"));
  });
});

describe("identity block", () => {
  const child = { firstName: "Zoe", gender: "girl", age: 5 } as const;
  it("tells the model the photos are the real child", () => {
    expect(buildPagePrompt(child, template, 3, false)).toContain("first 3 reference images are real photographs");
  });
  it("mentions the hero portrait only when one is supplied", () => {
    expect(buildPagePrompt(child, template, 3, false)).not.toContain("approved portrait");
    expect(buildPagePrompt(child, template, 3, true)).toContain("approved portrait");
  });
});
