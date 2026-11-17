import { createServer, type IncomingMessage } from "node:http";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { createFaceScoreClient } from "../../genkit-flows/src/adapters/faceScore.js";
import { createVertexAdapters } from "../../genkit-flows/src/adapters/vertex.js";
import { runPreview, type PreviewDeps } from "../../genkit-flows/src/preview/orchestrator.js";
import { ModelsConfig } from "../../genkit-flows/src/schemas.js";
import { PageRenderer } from "../../render/src/render.js";
import { gcsPreviewBlobs } from "./blobs.js";
import { config } from "./config.js";
import { loadContent } from "./content.js";
import { chromiumRenderer } from "./renderer.js";
import { FirestorePreviewStore } from "./store.js";

initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });

/** Logs carry IDs and reason codes only (never names, prompts or addresses). */
const log: PreviewDeps["log"] = {
  info: (message, fields) => console.log(JSON.stringify({ severity: "INFO", message, ...fields })),
  warn: (message, fields) => console.log(JSON.stringify({ severity: "WARNING", message, ...fields })),
};

/** The face-score service is private: each call carries a Google-signed ID token for its URL. */
const googleAuth = new GoogleAuth();
async function faceScoreHeaders(): Promise<Record<string, string>> {
  const client = await googleAuth.getIdTokenClient(config.faceScoreUrl);
  return { authorization: `Bearer ${await client.idTokenProvider.fetchIdToken(config.faceScoreUrl)}` };
}

const Body = z.object({ bookId: z.string().min(1).max(128) });

let depsPromise: Promise<PreviewDeps> | null = null;

/** Built on the first request and reused: loading Chromium and the story takes a few seconds. */
function getDeps(): Promise<PreviewDeps> {
  depsPromise ??= (async () => {
    const models = ModelsConfig.parse({
      primaryImageModel: config.imageModel,
      judgeModel: config.judgeModel,
      resolution: "2K",
      aspectRatio: "4:3",
      candidatesPerPage: 2,
      location: config.vertexLocation,
      usdPerMillionInputTokens: process.env["USD_PER_M_INPUT"] ? Number(process.env["USD_PER_M_INPUT"]) : null,
      usdPerMillionOutputTokens: process.env["USD_PER_M_OUTPUT"] ? Number(process.env["USD_PER_M_OUTPUT"]) : null,
    });
    const vertex = createVertexAdapters(
      { projectId: config.projectId, location: models.location, resolution: models.resolution, aspectRatio: models.aspectRatio },
      models.judgeModel,
    );
    const content = await loadContent(config.contentDir, config.allowDraftCopy);
    const browser = await PageRenderer.launch();
    return {
      store: new FirestorePreviewStore(),
      blobs: gcsPreviewBlobs({ uploads: config.uploadsBucket, generated: config.generatedBucket, preview: config.previewBucket }),
      renderer: chromiumRenderer(browser),
      content,
      gen: { models, images: vertex.images, judge: vertex.judge, faces: createFaceScoreClient(config.faceScoreUrl, faceScoreHeaders) },
      log,
      now: () => Date.now(),
    } satisfies PreviewDeps;
  })();
  depsPromise.catch(() => (depsPromise = null)); // a failed start is retried on the next request
  return depsPromise;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 10_000) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * POST /run {bookId}, called by Cloud Tasks with a Google-signed token (Cloud Run only lets the queue's service
 * account in). Any finished outcome answers 200 so the queue does not repeat it; an unexpected crash answers 500,
 * and the queue tries again (the job is safe to run again).
 */
const server = createServer(async (req, res) => {
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/") return reply(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/run") return reply(404, { error: "not found" });
  let bookId: string;
  try {
    bookId = Body.parse(await readJson(req)).bookId;
  } catch {
    return reply(400, { error: "bad request" });
  }
  try {
    const outcome = await runPreview(await getDeps(), bookId);
    log.info("preview run finished", { bookId, outcome });
    return reply(200, { outcome });
  } catch (e) {
    log.warn("preview run crashed", { bookId, errorName: e instanceof Error ? e.name : "Error" });
    return reply(500, { error: "unexpected" });
  }
});

server.listen(Number(process.env["PORT"] ?? 8080), () => log.info("preview worker listening"));
