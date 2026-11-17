import { z } from "zod";

export const Gender = z.enum(["girl", "boy", "neutral"]);
export type Gender = z.infer<typeof Gender>;

export const ChildInput = z.object({
  firstName: z.string().min(1).max(20),
  gender: Gender,
  age: z.number().int().min(1).max(7),
});
export type ChildInput = z.infer<typeof ChildInput>;

export const JudgeResult = z.object({
  hands_ok: z.boolean(),
  extra_limbs: z.boolean(),
  extra_children: z.boolean(),
  outfit_matches: z.boolean(),
  props_match: z.boolean(),
  age_looks_right: z.boolean(),
  style_matches: z.boolean(),
  text_in_image: z.boolean(),
  score: z.number().min(0).max(10),
});
export type JudgeResult = z.infer<typeof JudgeResult>;

export const PageTemplate = z.object({
  id: z.string(),
  titleWord: z.string(),
  textSide: z.enum(["left", "right"]),
  scene: z.string(),
  outfit: z.object({ girl: z.string(), boy: z.string(), neutral: z.string() }),
  composition: z.string(),
  styleRef: z.string().optional(),
});
export type PageTemplate = z.infer<typeof PageTemplate>;

/** Prices come from config, never hard-coded. Null until the owner verifies them. */
export const ModelsConfig = z.object({
  primaryImageModel: z.string(),
  judgeModel: z.string(),
  resolution: z.enum(["1K", "2K", "4K"]),
  aspectRatio: z.string(),
  candidatesPerPage: z.number().int().min(1).max(4),
  location: z.string(),
  usdPerMillionOutputTokens: z.number().nullable(),
  usdPerMillionInputTokens: z.number().nullable(),
});
export type ModelsConfig = z.infer<typeof ModelsConfig>;

export const LimitsConfig = z.object({
  faceScoreMin: z.number(),
  judgeScoreMin: z.number(),
});
export type LimitsConfig = z.infer<typeof LimitsConfig>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface Candidate {
  id: string;
  imageBase64: string;
  mimeType: string;
  model: string;
  promptHash: string;
  latencyMs: number;
  usage: Usage;
  costUsd: number | null;
  faceScore?: number;
  judge?: JudgeResult;
  passed?: boolean;
  combined?: number;
}
