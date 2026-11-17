import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROFESSIONS } from "../src/schemas.js";
import {
  CopyNotApprovedError,
  TEXT_TOKENS,
  UnknownTokenError,
  assertCopyApproved,
  fillLines,
  fillText,
  pronounsFor,
  tokensIn,
} from "../src/text.js";

interface Copy {
  approvedByOwner: boolean;
  intro: { rhyme: string[] };
  closing: { rhyme: string[]; signoff: Record<string, string> };
  professions: Record<string, { title: string; rhyme: string[]; funFact: string; motivation: string }>;
}
const copy = JSON.parse(readFileSync(new URL("../../../content/stories/when-i-grow-up/copy.en.json", import.meta.url), "utf8")) as Copy;

describe("pronouns", () => {
  it("girl, boy and neutral (they/them)", () => {
    expect(pronounsFor("girl")).toMatchObject({ subj: "she", poss: "her", obj: "her" });
    expect(pronounsFor("boy")).toMatchObject({ subj: "he", poss: "his", obj: "him" });
    expect(pronounsFor("neutral")).toMatchObject({ subj: "they", poss: "their", obj: "them" });
  });
  it("capitalised forms match", () => {
    for (const g of ["girl", "boy", "neutral"] as const) {
      const p = pronounsFor(g);
      expect(p.Subj).toBe(p.subj[0]!.toUpperCase() + p.subj.slice(1));
      expect(p.Poss).toBe(p.poss[0]!.toUpperCase() + p.poss.slice(1));
      expect(p.Obj).toBe(p.obj[0]!.toUpperCase() + p.obj.slice(1));
    }
  });
});

describe("fillText", () => {
  const girl = { name: "Zoe", gender: "girl" as const };
  it("replaces every token, repeated or not", () => {
    expect(fillText("{name} and {name} love {poss} toys.", girl)).toBe("Zoe and Zoe love her toys.");
    expect(fillText("{Subj} can help {obj}.", { name: "Ravi", gender: "boy" })).toBe("He can help him.");
    expect(fillText("{Subj} can help {obj}.", { name: "Sam", gender: "neutral" })).toBe("They can help them.");
  });
  it("leaves text without tokens alone", () => {
    expect(fillText("Hello there.", girl)).toBe("Hello there.");
  });
  it("keeps long and non-Latin names intact", () => {
    expect(fillText("{name}!", { name: "A".repeat(20), gender: "girl" })).toBe(`${"A".repeat(20)}!`);
    expect(fillText("{name}!", { name: "इशानी", gender: "girl" })).toBe("इशानी!");
  });
  it("does not treat the name as a template (no injection)", () => {
    expect(fillText("Hi {name}", { name: "{poss}", gender: "girl" })).toBe("Hi {poss}");
  });
  it("throws on an unknown token so a typo never reaches print", () => {
    expect(() => fillText("{nam} is here", girl)).toThrow(UnknownTokenError);
    expect(() => fillText("{}", girl)).toThrow(UnknownTokenError);
  });
  it("fillLines maps every line", () => {
    expect(fillLines(["a {name}", "b {name}"], girl)).toEqual(["a Zoe", "b Zoe"]);
  });
  it("tokensIn lists tokens in order", () => {
    expect(tokensIn("{name} likes {poss} {obj}")).toEqual(["name", "poss", "obj"]);
    expect(tokensIn("nothing here")).toEqual([]);
  });
});

describe("owner approval gate", () => {
  it("refuses unapproved copy", () => {
    expect(() => assertCopyApproved({ approvedByOwner: false })).toThrow(CopyNotApprovedError);
    expect(() => assertCopyApproved({})).toThrow(CopyNotApprovedError);
    expect(() => assertCopyApproved({ approvedByOwner: "true" })).toThrow(CopyNotApprovedError);
  });
  it("accepts only an explicit true", () => {
    expect(() => assertCopyApproved({ approvedByOwner: true })).not.toThrow();
  });
  it("the shipped draft copy is NOT yet approved (the owner must approve it)", () => {
    expect(copy.approvedByOwner).toBe(false);
  });
});

describe("the story copy file", () => {
  const all = [
    ...copy.intro.rhyme,
    ...copy.closing.rhyme,
    ...Object.values(copy.professions).flatMap((p) => [...p.rhyme, p.funFact, p.motivation]),
  ];

  it("covers every profession, and nothing else", () => {
    expect(Object.keys(copy.professions).sort()).toEqual([...PROFESSIONS].sort());
  });
  it("every profession has a 4-line rhyme, a fact and an encouraging line with the name", () => {
    for (const [id, p] of Object.entries(copy.professions)) {
      expect(p.title.length, id).toBeGreaterThan(2);
      expect(p.rhyme, id).toHaveLength(4);
      expect(p.rhyme.some((l) => l.includes("{name}")), `${id} rhyme should use the name`).toBe(true);
      expect(p.funFact.endsWith("."), `${id} fact ends with a full stop`).toBe(true);
      expect(p.motivation.includes("{name}"), `${id} motivation uses the name`).toBe(true);
    }
  });
  it("lines are short enough to read aloud and to fit the page", () => {
    const rhymeLines = [...copy.intro.rhyme, ...copy.closing.rhyme, ...Object.values(copy.professions).flatMap((p) => p.rhyme)];
    for (const line of rhymeLines) expect(line.length, line).toBeLessThanOrEqual(60);
    for (const p of Object.values(copy.professions)) {
      expect(p.funFact.length).toBeLessThanOrEqual(110);
      expect(p.motivation.length).toBeLessThanOrEqual(90);
    }
  });
  it("only uses known tokens", () => {
    for (const line of all) for (const t of tokensIn(line)) expect((TEXT_TOKENS as readonly string[]).includes(t), `${t} in "${line}"`).toBe(true);
  });
  it("never puts he/she/they in front of a verb that changes with the pronoun", () => {
    const safeNext = ["can", "will", "may", "might", "would", "could", "should", "must"];
    for (const line of all) {
      for (const m of line.matchAll(/\{(?:subj|Subj)\}\s+(\w+)/g)) expect(safeNext, `"${line}"`).toContain(m[1]);
    }
  });
  it("fills cleanly for every child type, leaving no braces", () => {
    for (const gender of ["girl", "boy", "neutral"] as const) {
      for (const line of all) {
        const out = fillText(line, { name: "Zoe", gender });
        expect(out).not.toMatch(/[{}]|undefined/);
      }
    }
  });
  it("has a sign-off for every relationship", () => {
    for (const r of ["parent", "grandparent", "aunt_uncle", "sibling", "family_friend", "other"]) {
      expect(copy.closing.signoff[r]?.length ?? 0).toBeGreaterThan(3);
    }
  });
  it("contains no hard-coded child names", () => {
    const names = ["Zoe", "Ishani", "Ravi", "Aarav", "Anaya"];
    for (const line of all) for (const n of names) expect(line).not.toContain(n);
  });
});
