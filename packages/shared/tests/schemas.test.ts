import { describe, expect, it } from "vitest";
import { Age, BookCreateInput, DEFAULT_LIMITS, DEFAULT_PROFESSIONS, DEFAULT_STORY_ID, FirstName, LimitsConfig, StoryId } from "../src/schemas.js";

describe("StoryId", () => {
  it("accepts lowercase slugs and rejects everything else", () => {
    for (const s of ["when-i-grow-up", "animal-friends", "a", "story2"]) expect(StoryId.safeParse(s).success).toBe(true);
    for (const s of ["", "Bad Story", "UPPER", "under_score", "x".repeat(41), "../etc"]) expect(StoryId.safeParse(s).success).toBe(false);
  });
  it("books default to the first story", () => {
    const r = BookCreateInput.parse({ child: { firstName: "Zoe", gender: "girl", age: 5 }, relationship: "parent", professions: [...DEFAULT_PROFESSIONS] });
    expect(r.storyId).toBe(DEFAULT_STORY_ID);
  });
});

describe("FirstName", () => {
  it.each(["Zoe", "Anne-Marie", "O'Brien", "José", "Ñandú", "इशानी", "Mary Ann"])("accepts %s", (n) => {
    expect(FirstName.safeParse(n).success).toBe(true);
  });
  it.each(["", "   ", "A1", "Bob<script>", "-Dash", "12345"])("rejects %j", (n) => {
    expect(FirstName.safeParse(n).success).toBe(false);
  });
  it("accepts exactly 20 characters and rejects 21", () => {
    expect(FirstName.safeParse("A".repeat(20)).success).toBe(true);
    expect(FirstName.safeParse("A".repeat(21)).success).toBe(false);
  });
  it("trims whitespace", () => {
    expect(FirstName.parse("  Zoe ")).toBe("Zoe");
  });
});

describe("Age", () => {
  it("accepts 1 to 7 only", () => {
    for (const a of [1, 2, 3, 4, 5, 6, 7]) expect(Age.safeParse(a).success).toBe(true);
    for (const a of [0, -1, 8, 3.5, 1.5]) expect(Age.safeParse(a).success).toBe(false);
  });
});

describe("BookCreateInput", () => {
  const ok = { child: { firstName: "Zoe", gender: "girl", age: 5 }, relationship: "parent", professions: [...DEFAULT_PROFESSIONS] };
  it("accepts a valid draft and defaults the dedication", () => {
    expect(BookCreateInput.parse(ok).dedicationText).toBe("");
  });
  it("needs exactly 8 unique professions", () => {
    expect(BookCreateInput.safeParse({ ...ok, professions: DEFAULT_PROFESSIONS.slice(0, 7) }).success).toBe(false);
    expect(BookCreateInput.safeParse({ ...ok, professions: [...DEFAULT_PROFESSIONS.slice(0, 7), "doctor"] }).success).toBe(false);
  });
  it("rejects an unknown profession and an over-long dedication", () => {
    expect(BookCreateInput.safeParse({ ...ok, professions: [...DEFAULT_PROFESSIONS.slice(0, 7), "wizard"] }).success).toBe(false);
    expect(BookCreateInput.safeParse({ ...ok, dedicationText: "x".repeat(401) }).success).toBe(false);
  });
});

describe("limits defaults", () => {
  it("match the spec and validate", () => {
    expect(LimitsConfig.safeParse(DEFAULT_LIMITS).success).toBe(true);
    expect(DEFAULT_LIMITS).toMatchObject({ previewsPerUser: 1, regensPerBook: 1, maxCandidatesPerPage: 4, maxDailyPreviews: 200, maxDailyImageCalls: 2000 });
  });
});
