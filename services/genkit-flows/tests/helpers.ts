import type { Deps } from "../src/pipeline.js";
import type { JudgeResult, PageTemplate } from "../src/schemas.js";

export const template: PageTemplate = {
  id: "doctor",
  titleWord: "DOCTOR",
  textSide: "right",
  scene: "child in a white doctor's coat with a stethoscope",
  outfit: { girl: "white coat, hair clips", boy: "white coat", neutral: "white coat" },
  composition: "child on left two-thirds",
};

export const goodJudge: JudgeResult = {
  hands_ok: true, extra_limbs: false, extra_children: false, outfit_matches: true,
  props_match: true, age_looks_right: true, style_matches: true, text_in_image: false, score: 9,
};

export function makeDeps(over: Partial<Deps> = {}): Deps {
  return {
    images: { generate: async () => ({ base64: "AAAA", mimeType: "image/png", usage: { inputTokens: 100, outputTokens: 1120 } }) },
    judge: { judge: async () => goodJudge },
    faces: { compare: async () => ({ similarity: 0.7, faces: 1, largestFaceWidthFraction: 0.3 }) },
    models: {
      primaryImageModel: "gemini-3.1-flash-image", judgeModel: "gemini-flash", resolution: "2K", aspectRatio: "4:3",
      candidatesPerPage: 3, location: "global", usdPerMillionInputTokens: null, usdPerMillionOutputTokens: null,
    },
    limits: { faceScoreMin: 0.4, judgeScoreMin: 7 },
    ...over,
  };
}
