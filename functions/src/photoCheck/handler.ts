import {
  PHOTO_CHECK_DEFAULTS,
  cosineSimilarity,
  evaluateFaces,
  photosAreSameChild,
  type BookStatus,
  type PhotoCheckConfig,
  type PhotoFailReason,
} from "@gycb/shared";
import type { BlobStore, BookStore, Embedder, FaceDetector, ImageNormaliser, PhotoRecord } from "./ports.js";

export const PHOTO_IDS = ["photo1", "photo2", "photo3"] as const;
export type PhotoId = (typeof PHOTO_IDS)[number];

/** Raw upload (no extension), the cleaned JPEG, and the embedding sidecar. */
export const rawPath = (bookId: string, photoId: string) => `books/${bookId}/photos/${photoId}`;
export const cleanPath = (bookId: string, photoId: string) => `${rawPath(bookId, photoId)}.jpg`;
export const embeddingPath = (bookId: string, photoId: string) => `${rawPath(bookId, photoId)}.embedding.json`;

/** Parses a storage object name like books/<bookId>/photos/photo2. Anything else (our own .jpg output) is ignored. */
export function parseRawPhotoPath(name: string): { bookId: string; photoId: PhotoId } | null {
  const m = /^books\/([A-Za-z0-9_-]{1,128})\/photos\/(photo[123])$/.exec(name);
  return m ? { bookId: m[1] as string, photoId: m[2] as PhotoId } : null;
}

/** Logs carry IDs and reason codes only: never names, emails, photos or signed URLs. */
export interface Logger {
  info(message: string, fields?: Record<string, string | number | boolean>): void;
  warn(message: string, fields?: Record<string, string | number | boolean>): void;
}

export interface PhotoCheckDeps {
  books: BookStore;
  blobs: BlobStore;
  images: ImageNormaliser;
  vision: FaceDetector;
  embedder: Embedder;
  log: Logger;
  now: () => number;
  config?: PhotoCheckConfig;
}

export type PhotoCheckOutcome = "ignored" | "checking" | "photos_ready" | "photos_failed";

const EDITABLE: readonly BookStatus[] = ["draft", "photos_checking", "photos_failed", "photos_ready"];
const ACTOR = "system:photo-check";

export async function checkPhoto(deps: PhotoCheckDeps, bookId: string, photoId: PhotoId): Promise<PhotoCheckOutcome> {
  const { books, blobs, log } = deps;
  const cfg = deps.config ?? PHOTO_CHECK_DEFAULTS;
  const raw = rawPath(bookId, photoId);

  const book = await books.getBook(bookId);
  if (!book || !EDITABLE.includes(book.status)) {
    log.warn("photo ignored: book missing or not editable", { bookId, photoId });
    await safeRemove(blobs, raw);
    return "ignored";
  }

  if (book.status !== "photos_checking") await books.transition(bookId, book.status, "photos_checking", ACTOR);
  await books.setPhoto(bookId, photoId, { checkStatus: "pending", updatedAt: deps.now() });

  const failed = async (reason: PhotoFailReason): Promise<PhotoCheckOutcome> => {
    log.info("photo failed", { bookId, photoId, reason });
    await Promise.all([safeRemove(blobs, raw), safeRemove(blobs, cleanPath(bookId, photoId)), safeRemove(blobs, embeddingPath(bookId, photoId))]);
    await books.setPhoto(bookId, photoId, { checkStatus: "fail", failReason: reason, updatedAt: deps.now() });
    return finalise(deps, bookId, cfg);
  };

  // 1. Read and normalise (HEIC to JPEG, orientation, strip EXIF, resize).
  let normalised;
  try {
    normalised = await deps.images.normalise(await blobs.download(raw), cfg.maxLongEdgePx);
  } catch {
    return failed("UNREADABLE");
  }

  // 2. Face rules from Cloud Vision.
  let faces;
  try {
    faces = await deps.vision.detectFaces(normalised.jpeg);
  } catch {
    return failed("CHECK_FAILED");
  }
  const verdict = evaluateFaces(faces, normalised.width, cfg);
  if (!verdict.ok) return failed(verdict.reason);

  // 3. Embedding for the same-child check.
  let embedding: number[];
  try {
    embedding = await deps.embedder.embed(normalised.jpeg);
  } catch {
    return failed("CHECK_FAILED");
  }

  // 4. Keep only the cleaned JPEG and the embedding; remove the raw upload.
  await blobs.upload(cleanPath(bookId, photoId), normalised.jpeg, "image/jpeg");
  await blobs.upload(embeddingPath(bookId, photoId), Buffer.from(JSON.stringify(embedding)), "application/json");
  await safeRemove(blobs, raw);

  const xs = (verdict.face.boundingPoly?.vertices ?? []).map((v) => v.x ?? 0);
  const ys = (verdict.face.boundingPoly?.vertices ?? []).map((v) => v.y ?? 0);
  const record: PhotoRecord = {
    checkStatus: "pass",
    storagePath: cleanPath(bookId, photoId),
    embeddingRef: embeddingPath(bookId, photoId),
    faceBox: {
      x: Math.min(...xs) / normalised.width,
      y: Math.min(...ys) / normalised.height,
      w: (Math.max(...xs) - Math.min(...xs)) / normalised.width,
      h: (Math.max(...ys) - Math.min(...ys)) / normalised.height,
    },
    qualityScores: { faceWidthFraction: verdict.widthFraction, detectionConfidence: verdict.face.detectionConfidence ?? 0 },
    updatedAt: deps.now(),
  };
  await books.setPhoto(bookId, photoId, record);
  log.info("photo passed", { bookId, photoId });
  return finalise(deps, bookId, cfg);
}

/** After each photo: decide whether the book is waiting, failed, or ready. Safe to run concurrently. */
async function finalise(deps: PhotoCheckDeps, bookId: string, cfg: PhotoCheckConfig): Promise<PhotoCheckOutcome> {
  const { books, blobs, log } = deps;
  const photos = await books.getPhotos(bookId);
  const docs = PHOTO_IDS.map((id) => [id, photos[id]] as const);

  const anyFailed = docs.some(([, p]) => p?.checkStatus === "fail");
  const allPassed = docs.every(([, p]) => p?.checkStatus === "pass");

  if (anyFailed) {
    await books.transition(bookId, "photos_checking", "photos_failed", ACTOR);
    return "photos_failed";
  }
  if (!allPassed) return "checking";

  // All three passed individually: make sure they show the same child.
  const embeddings = await Promise.all(
    PHOTO_IDS.map(async (id) => JSON.parse((await blobs.download(embeddingPath(bookId, id))).toString("utf8")) as number[]),
  );
  if (!photosAreSameChild(embeddings, cfg)) {
    const odd = oddOneOut(embeddings);
    const oddId = PHOTO_IDS[odd] as PhotoId;
    log.info("photos do not match", { bookId, photoId: oddId, reason: "DIFFERENT_CHILD" });
    await Promise.all([safeRemove(blobs, cleanPath(bookId, oddId)), safeRemove(blobs, embeddingPath(bookId, oddId))]);
    await books.setPhoto(bookId, oddId, { checkStatus: "fail", failReason: "DIFFERENT_CHILD", updatedAt: deps.now() });
    await books.transition(bookId, "photos_checking", "photos_failed", ACTOR);
    return "photos_failed";
  }

  const moved = await books.transition(bookId, "photos_checking", "photos_ready", ACTOR);
  if (moved) log.info("photos ready", { bookId });
  return "photos_ready";
}

/** The photo with the lowest average similarity to the others is the likeliest wrong child. */
export function oddOneOut(embeddings: readonly (readonly number[])[]): number {
  let worst = 0;
  let worstMean = Infinity;
  embeddings.forEach((e, i) => {
    const others = embeddings.filter((_, j) => j !== i);
    const mean = others.reduce((s, o) => s + cosineSimilarity(e, o), 0) / others.length;
    if (mean < worstMean) {
      worstMean = mean;
      worst = i;
    }
  });
  return worst;
}

async function safeRemove(blobs: BlobStore, path: string): Promise<void> {
  try {
    await blobs.remove(path);
  } catch {
    /* already gone */
  }
}
