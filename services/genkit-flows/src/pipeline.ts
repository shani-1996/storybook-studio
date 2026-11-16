import { randomUUID } from "node:crypto";
import { estimateCostUsd } from "./cost.js";
import { buildPagePrompt, promptHash } from "./prompt.js";
import type { FaceScorer, ImageModel, ImageRef, Judge } from "./ports.js";
import { evaluate, selectBest } from "./scoring.js";
import type { Candidate, ChildInput, LimitsConfig, ModelsConfig, PageTemplate } from "./schemas.js";

export interface Deps {
  images: ImageModel;
  judge: Judge;
  faces: FaceScorer;
  models: ModelsConfig;
  limits: LimitsConfig;
  style?: string;
}

export interface PageResult {
  candidates: Candidate[];
  selected: Candidate | null;
  blocked: boolean;
}

/** One candidate: retry once on a no-image response (safety block), per spec section 6. */
async function generateOne(
  deps: Deps,
  prompt: string,
  refs: ImageRef[],
  seed: number,
): Promise<Candidate | null> {
  const model = deps.models.primaryImageModel;
  const started = Date.now();
  let out = await deps.images.generate({ model, prompt, refs, seed });
  if (!out) out = await deps.images.generate({ model, prompt, refs, seed });
  if (!out) return null;
  return {
    id: randomUUID(),
    imageBase64: out.base64,
    mimeType: out.mimeType,
    model,
    promptHash: promptHash(prompt),
    latencyMs: Date.now() - started,
    usage: out.usage,
    costUsd: estimateCostUsd(out.usage, deps.models),
  };
}

export async function generatePage(
  deps: Deps,
  child: ChildInput,
  template: PageTemplate,
  photos: ImageRef[],
  extraRefs: ImageRef[] = [],
): Promise<PageResult> {
  const prompt = buildPagePrompt(child, template, photos.length, extraRefs.length > 0, deps.style);
  const refs = [...photos, ...extraRefs]; // photos first, hero last (matches the prompt)
  const raw: Candidate[] = [];
  let blockedCount = 0;

  for (let i = 0; i < deps.models.candidatesPerPage; i++) {
    const cand = await generateOne(deps, prompt, refs, 1000 + i);
    if (!cand) {
      blockedCount++;
      continue;
    }
    const image = { base64: cand.imageBase64, mimeType: cand.mimeType };
    const face = await deps.faces.compare({ image, references: photos });
    cand.faceScore = face.faces === 1 ? face.similarity : -1;
    cand.judge = await deps.judge.judge({ image, expectation: `${template.scene}; ${template.outfit[child.gender]}` });
    raw.push(evaluate(cand, deps.limits));
  }

  return {
    candidates: raw,
    selected: selectBest(raw),
    blocked: raw.length === 0 && blockedCount > 0,
  };
}

export async function generateHeroSheet(
  deps: Deps,
  child: ChildInput,
  heroTemplate: PageTemplate,
  photos: ImageRef[],
): Promise<PageResult> {
  return generatePage(deps, child, heroTemplate, photos);
}
