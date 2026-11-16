/**
 * Milestone 1 quality spike.
 *
 *   pnpm spike -- --photos C:\spike-photos --out C:\spike-output [--dry-run] [--model gemini-3.1-flash-image]
 *
 * Expects <photos>/<setName>/*.jpg|png (3 photos per set). For each set it builds a hero sheet,
 * then 4 profession pages, scores every candidate, and writes images, results.json and ratings.csv.
 * Output contains children's photos/images: keep it OUT of the repo and delete it after the spike.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { parseArgs } from "node:util";
import { createFaceScoreClient } from "../src/adapters/faceScore.js";
import { createVertexAdapters } from "../src/adapters/vertex.js";
import sharp from "sharp";
import { STYLES } from "../src/prompt.js";
import { generateHeroSheet, generatePage, type Deps, type PageResult } from "../src/pipeline.js";
import { ModelsConfig, PageTemplate, type ChildInput } from "../src/schemas.js";
import type { ImageRef } from "../src/ports.js";

const { values } = parseArgs({
  options: {
    photos: { type: "string" },
    out: { type: "string" },
    model: { type: "string" },
    style: { type: "string", default: "watercolour" },
    project: { type: "string", default: "book-dev-env" },
    "face-url": { type: "string", default: "http://127.0.0.1:8081" },
    "dry-run": { type: "boolean", default: false },
    "max-sets": { type: "string", default: "50" },
    only: { type: "string" },
    hero: { type: "string" },
    candidates: { type: "string", default: "2" },
  },
});

const PROFESSIONS = ["doctor", "pilot", "astronaut", "chef"];
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

async function loadTemplate(id: string) {
  const raw = await readFile(new URL(`../../../content/stories/when-i-grow-up/templates/${id}.json`, import.meta.url), "utf8");
  return PageTemplate.parse(JSON.parse(raw));
}

async function loadSet(dir: string): Promise<ImageRef[]> {
  const files = (await readdir(dir)).filter((f) => MIME[extname(f).toLowerCase()]).sort().slice(0, 3);
  // Downscale to 1024px JPEG (spec step 1 also strips EXIF and caps size). Smaller requests = fewer tokens and 429s.
  return Promise.all(
    files.map(async (f) => ({
      base64: (await sharp(join(dir, f)).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64"),
      mimeType: "image/jpeg",
    })),
  );
}

/** Per-set child details come from <set>/child.json {gender, age}. Names are NOT needed for the spike. */
async function loadChild(dir: string): Promise<ChildInput> {
  try {
    const j = JSON.parse(await readFile(join(dir, "child.json"), "utf8"));
    return { firstName: "X", gender: j.gender ?? "neutral", age: j.age ?? 5 };
  } catch {
    return { firstName: "X", gender: "neutral", age: 5 };
  }
}

function dryRunDeps(models: Deps["models"], limits: Deps["limits"]): Deps {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
  return {
    models, limits,
    images: { generate: async () => ({ base64: png, mimeType: "image/png", usage: { inputTokens: 500, outputTokens: 1120 } }) },
    judge: { judge: async () => ({ hands_ok: true, extra_limbs: false, extra_children: false, outfit_matches: true, props_match: true, age_looks_right: true, style_matches: true, text_in_image: false, score: 8 }) },
    faces: { compare: async () => ({ similarity: 0.6, faces: 1, largestFaceWidthFraction: 0.3 }) },
  };
}

async function main() {
  if (!values.photos || !values.out) throw new Error("--photos and --out are required");
  const dry = values["dry-run"] ?? false;

  const models = ModelsConfig.parse({
    primaryImageModel: values.model ?? "gemini-3.1-flash-image",
    judgeModel: "gemini-3-flash-preview",
    resolution: "2K",
    aspectRatio: "4:3",
    candidatesPerPage: Number(values.candidates),
    location: "global",
    // Owner: set these from the current Vertex pricing page (docs/decisions.md). Null = cost unknown.
    usdPerMillionInputTokens: null,
    usdPerMillionOutputTokens: null,
  });
  const limits = { faceScoreMin: 0.4, judgeScoreMin: 7 };
  const style = STYLES[values.style as string];
  if (!style) throw new Error(`unknown --style; choose one of: ${Object.keys(STYLES).join(", ")}`);

  let deps: Deps;
  if (dry) {
    deps = dryRunDeps(models, limits);
  } else {
    const v = createVertexAdapters(
      { projectId: values.project as string, location: models.location, resolution: models.resolution, aspectRatio: models.aspectRatio },
      models.judgeModel,
    );
    deps = { models, limits, style, images: v.images, judge: v.judge, faces: createFaceScoreClient(values["face-url"] as string) };
  }

  const sets = (await readdir(values.photos, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).map((e) => e.name).sort().slice(0, Number(values["max-sets"]));
  if (sets.length === 0) throw new Error("no photo set folders found");

  const heroT = await loadTemplate("hero");
  // --only cover,doctor generates just those pages from the photos alone (no hero sheet).
  const onlyIds = values.only ? values.only.split(",").map((s) => s.trim()) : null;
  const profs = await Promise.all((onlyIds ?? PROFESSIONS).map(loadTemplate));
  const results: unknown[] = [];
  const csv: string[] = ["set,page,file,YOUR_RATING_1_TO_5,faceScore,judgeScore,passed,model,costUsd"];

  for (const setName of sets) {
    const dir = join(values.photos, setName);
    const photos = await loadSet(dir);
    if (photos.length < 3) { console.warn(`${setName}: needs 3 photos, found ${photos.length}; skipped`); continue; }
    const child = await loadChild(dir);
    const outDir = join(values.out, setName);
    await mkdir(outDir, { recursive: true });
    console.log(`[${setName}] hero sheet...`);

    // Save each page as soon as it finishes so a later failure never loses paid-for images.
    const save = async (t: { id: string }, r: PageResult | null, error?: string) => {
      for (const c of r?.candidates ?? []) {
        const file = `${t.id}-${c.id.slice(0, 8)}.png`;
        await writeFile(join(outDir, file), Buffer.from(c.imageBase64, "base64"));
        csv.push([setName, t.id, file, "", c.faceScore?.toFixed(3), c.judge?.score, c.passed, c.model, c.costUsd ?? "unknown"].join(","));
      }
      results.push({
        set: setName, page: t.id, blocked: r?.blocked ?? false, error: error ?? null, selected: r?.selected?.id ?? null,
        candidates: (r?.candidates ?? []).map((c) => ({ id: c.id, faceScore: c.faceScore, judge: c.judge, passed: c.passed, combined: c.combined,
          latencyMs: c.latencyMs, usage: c.usage, costUsd: c.costUsd, model: c.model, promptHash: c.promptHash })),
      });
      await writeFile(join(values.out as string, "results.json"), JSON.stringify(results, null, 2));
      await writeFile(join(values.out as string, "ratings.csv"), csv.join("\n"));
    };
    const attempt = async (t: PageTemplate, fn: () => Promise<PageResult>): Promise<PageResult | null> => {
      try {
        const r = await fn();
        await save(t, r);
        return r;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        console.warn(`[${setName}] ${t.id} FAILED: ${msg}`);
        await save(t, null, msg);
        return null;
      }
    };

    const hero = onlyIds ? null : await attempt(heroT, () => generateHeroSheet(deps, child, heroT, photos));
    const heroImg = hero?.selected ?? hero?.candidates[0];
    // An approved hero portrait can be supplied with --hero <file> (e.g. the owner's top-rated image).
    const heroSource = values.hero ? await readFile(values.hero) : heroImg ? Buffer.from(heroImg.imageBase64, "base64") : null;
    const extra: ImageRef[] = heroSource
      ? [{ base64: (await sharp(heroSource).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64"), mimeType: "image/jpeg" }]
      : [];
    for (const t of profs) {
      console.log(`[${setName}] ${t.id}...`);
      await attempt(t, () => generatePage(deps, child, t, photos, extra));
    }
  }

  await mkdir(values.out, { recursive: true });
  await writeFile(join(values.out, "results.json"), JSON.stringify(results, null, 2));
  await writeFile(join(values.out, "ratings.csv"), csv.join("\n"));
  console.log(`done. wrote results.json and ratings.csv to ${values.out}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
