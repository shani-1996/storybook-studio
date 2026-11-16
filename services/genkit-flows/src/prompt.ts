import { createHash } from "node:crypto";
import type { ChildInput, PageTemplate } from "./schemas.js";

const PRONOUN = { girl: "she", boy: "he", neutral: "they" } as const;

/** Fixed rules from spec section 6. Kept as data so they can move to config later. */
export const FIXED_RULES = [
  "Exactly one child in the image.",
  "No text, letters, numbers or logos anywhere in the image.",
  "Child-appropriate, warm and gentle.",
  "Keep the child's face identical to the reference photos and hero portrait.",
];

export const STYLE_BLOCK =
  "Soft hand-painted watercolour children's book illustration, gentle colours, 4:3 landscape.";

export function identityBlock(photoCount: number, hasHero: boolean): string {
  return (
    `The first ${photoCount} reference images are real photographs of one specific child. ` +
    "Draw THIS exact child: copy their face shape, eyes, eyebrows, nose, mouth, ears, skin tone, hair colour, hairstyle and hair texture as closely as the illustration style allows. " +
    "Do not make a generic child. " +
    (hasHero ? "The last reference image is the approved portrait of this child in the book style: keep the character identical to it." : "")
  );
}

export const STYLES: Record<string, string> = {
  watercolour: STYLE_BLOCK,
  photoreal:
    "Photorealistic portrait photograph style, natural skin texture and lighting, true-to-life facial features and proportions, shallow depth of field, soft natural light, 4:3 landscape. The child must look like a real photo of this exact child.",
  semireal:
    "Polished semi-realistic children's book illustration: soft painterly rendering with natural, accurate facial features and proportions, warm gentle lighting, 4:3 landscape.",
};

export function buildPagePrompt(child: ChildInput, template: PageTemplate, photoCount = 3, hasHero = false, style: string = STYLE_BLOCK): string {
  const pronoun = PRONOUN[child.gender];
  const outfit = template.outfit[child.gender];
  // Deliberately excludes the child's name: names must never be in prompts or logs.
  return [
    identityBlock(photoCount, hasHero),
    style,
    `A ${child.age}-year-old child (${pronoun}/${pronoun === "they" ? "them" : pronoun === "she" ? "her" : "him"}).`,
    `Scene: ${template.scene}.`,
    `Outfit: ${outfit}.`,
    `Composition: ${template.composition}. Keep the ${template.textSide} side light and empty.`,
    ...FIXED_RULES,
  ].join("\n");
}

export function promptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}
