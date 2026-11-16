import type { JudgeResult, Usage } from "./schemas.js";

export interface ImageRef {
  base64: string;
  mimeType: string;
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
  usage: Usage;
}

/** Returns null when the model produced no image (safety block, even on HTTP 200). */
export interface ImageModel {
  generate(args: { model: string; prompt: string; refs: ImageRef[]; seed?: number }): Promise<GeneratedImage | null>;
}

export interface Judge {
  judge(args: { image: ImageRef; expectation: string }): Promise<JudgeResult>;
}

export interface FaceScorer {
  /** Mean-of-reference-embeddings cosine similarity, plus number of faces and face width fraction. */
  compare(args: { image: ImageRef; references: ImageRef[] }): Promise<{ similarity: number; faces: number; largestFaceWidthFraction: number }>;
}
