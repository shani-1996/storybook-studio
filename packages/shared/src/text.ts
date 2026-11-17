/**
 * Fills the story text with the child's name and the right pronouns.
 * Copy lives in content/stories/<story>/copy.en.json and uses these tokens:
 *   {name}  {subj}/{Subj}  {poss}/{Poss}  {obj}/{Obj}
 * The copy avoids verbs that change with he, she or they, so the same text reads correctly for every child.
 */
export type TextGender = "girl" | "boy" | "neutral";

export const TEXT_TOKENS = ["name", "subj", "Subj", "poss", "Poss", "obj", "Obj"] as const;
export type TextToken = (typeof TEXT_TOKENS)[number];

const PRONOUNS: Record<TextGender, Record<Exclude<TextToken, "name">, string>> = {
  girl: { subj: "she", Subj: "She", poss: "her", Poss: "Her", obj: "her", Obj: "Her" },
  boy: { subj: "he", Subj: "He", poss: "his", Poss: "His", obj: "him", Obj: "Him" },
  neutral: { subj: "they", Subj: "They", poss: "their", Poss: "Their", obj: "them", Obj: "Them" },
};

export function pronounsFor(gender: TextGender) {
  return PRONOUNS[gender];
}

/** Tokens used in a piece of text, in order, for validation. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] as string);
}

export class UnknownTokenError extends Error {
  constructor(public readonly token: string) {
    super(`unknown token in story text: {${token}}`);
  }
}

export function fillText(text: string, child: { name: string; gender: TextGender }): string {
  const p = PRONOUNS[child.gender];
  return text.replace(/\{([^{}]*)\}/g, (_, token: string) => {
    if (token === "name") return child.name;
    if (token in p) return p[token as keyof typeof p];
    throw new UnknownTokenError(token);
  });
}

export function fillLines(lines: readonly string[], child: { name: string; gender: TextGender }): string[] {
  return lines.map((l) => fillText(l, child));
}

export class CopyNotApprovedError extends Error {
  constructor() {
    super("The story copy has not been approved by the owner (approvedByOwner is false). Refusing to print.");
  }
}

/** The print step calls this first. Spec: never ship invented copy without owner approval. */
export function assertCopyApproved(copy: { approvedByOwner?: unknown }): void {
  if (copy.approvedByOwner !== true) throw new CopyNotApprovedError();
}
