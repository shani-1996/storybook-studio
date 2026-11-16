import { genkit, z } from "genkit";
import { vertexAI } from "@genkit-ai/google-genai";
import { JudgeResult } from "../schemas.js";
import { withBackoff } from "../retry.js";
import type { ImageModel, ImageRef, Judge } from "../ports.js";

const judgeOutput = z.object({
  hands_ok: z.boolean(),
  extra_limbs: z.boolean(),
  extra_children: z.boolean(),
  outfit_matches: z.boolean(),
  props_match: z.boolean(),
  age_looks_right: z.boolean(),
  style_matches: z.boolean(),
  text_in_image: z.boolean(),
  score: z.number(),
});

function dataUri(r: ImageRef): string {
  return `data:${r.mimeType};base64,${r.base64}`;
}

export interface VertexOptions {
  projectId: string;
  location: string;
  resolution: "1K" | "2K" | "4K";
  aspectRatio: string;
}

export function createVertexAdapters(opts: VertexOptions, judgeModel: string): { images: ImageModel; judge: Judge } {
  // Application Default Credentials: no keys in code. Paid Vertex endpoint only (spec section 10).
  const ai = genkit({ plugins: [vertexAI({ projectId: opts.projectId, location: opts.location })] });

  const images: ImageModel = {
    async generate({ model, prompt, refs }) {
      const res = await withBackoff(() => ai.generate({
        model: vertexAI.model(model),
        prompt: [{ text: prompt }, ...refs.map((r) => ({ media: { url: dataUri(r), contentType: r.mimeType } }))],
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: opts.aspectRatio, imageSize: opts.resolution },
        },
      }));
      const media = res.media;
      if (!media?.url) return null; // blocked or empty, even on HTTP 200
      const m = /^data:([^;]+);base64,(.*)$/s.exec(media.url);
      if (!m) return null;
      return {
        mimeType: m[1] ?? "image/png",
        base64: m[2] ?? "",
        usage: { inputTokens: res.usage?.inputTokens ?? 0, outputTokens: res.usage?.outputTokens ?? 0 },
      };
    },
  };

  const judge: Judge = {
    async judge({ image, expectation }) {
      const res = await withBackoff(() => ai.generate({
        model: vertexAI.model(judgeModel),
        prompt: [
          {
            text:
              "You check one children's-book illustration for defects. Expected scene and outfit: " +
              expectation +
              ". Answer strictly as JSON. Fields: hands_ok (hands look normal), extra_limbs, extra_children (more than one child), " +
              "outfit_matches, props_match, age_looks_right, style_matches (watercolour storybook), " +
              "text_in_image (any letters or logos), score (0 to 10 overall quality).",
          },
          { media: { url: dataUri(image), contentType: image.mimeType } },
        ],
        output: { schema: judgeOutput },
      }));
      return JudgeResult.parse(res.output);
    },
  };

  return { images, judge };
}
