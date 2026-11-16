import { assertTransition, type BookStatus, type VisionFace } from "@gycb/shared";
import type { BlobStore, BookRecord, BookStore, Embedder, FaceDetector, ImageNormaliser, PhotoRecord } from "../src/photoCheck/ports.js";
import type { Logger, PhotoCheckDeps } from "../src/photoCheck/handler.js";

export class MemoryBooks implements BookStore {
  books = new Map<string, BookRecord>();
  photos = new Map<string, Map<string, PhotoRecord>>();
  audit: { bookId: string; from: BookStatus; to: BookStatus; actor: string }[] = [];

  seed(bookId: string, status: BookStatus = "draft", ownerUid = "owner") {
    this.books.set(bookId, { ownerUid, status });
  }
  async getBook(bookId: string) {
    return this.books.get(bookId) ?? null;
  }
  async transition(bookId: string, from: BookStatus, to: BookStatus, actor: string) {
    const b = this.books.get(bookId);
    if (!b || b.status !== from) return false;
    assertTransition(from, to); // same rule the real store enforces
    b.status = to;
    this.audit.push({ bookId, from, to, actor });
    return true;
  }
  async setPhoto(bookId: string, photoId: string, record: PhotoRecord) {
    if (!this.photos.has(bookId)) this.photos.set(bookId, new Map());
    this.photos.get(bookId)!.set(photoId, record);
  }
  async getPhotos(bookId: string) {
    return Object.fromEntries(this.photos.get(bookId) ?? []);
  }
  status(bookId: string) {
    return this.books.get(bookId)!.status;
  }
  photo(bookId: string, photoId: string) {
    return this.photos.get(bookId)?.get(photoId);
  }
}

export class MemoryBlobs implements BlobStore {
  files = new Map<string, Buffer>();
  async download(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error("not found");
    return f;
  }
  async upload(path: string, data: Buffer) {
    this.files.set(path, data);
  }
  async remove(path: string) {
    if (!this.files.delete(path)) throw new Error("not found");
  }
  has(path: string) {
    return this.files.has(path);
  }
}

/**
 * Test photos are tiny text payloads: "<face>|<embedding>". Examples: "ok|1,0,0", "none|1,0,0", "blur|1,0,0".
 * The fakes below read them instead of calling Vision or the face service.
 */
export const photo = (face: string, embedding = "1,0,0") => Buffer.from(`${face}|${embedding}`);

const goodFace = (): VisionFace => ({
  boundingPoly: { vertices: [{ x: 300, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 500 }, { x: 300, y: 500 }] },
  detectionConfidence: 0.97,
  rollAngle: 2,
  tiltAngle: 2,
  blurredLikelihood: "VERY_UNLIKELY",
  underExposedLikelihood: "VERY_UNLIKELY",
  headwearLikelihood: "VERY_UNLIKELY",
});

const VISION: Record<string, () => VisionFace[]> = {
  ok: () => [goodFace()],
  none: () => [],
  two: () => [goodFace(), goodFace()],
  small: () => [{ ...goodFace(), boundingPoly: { vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }] } }],
  blur: () => [{ ...goodFace(), blurredLikelihood: "VERY_LIKELY" }],
  dark: () => [{ ...goodFace(), underExposedLikelihood: "LIKELY" }],
  tilt: () => [{ ...goodFace(), rollAngle: 40 }],
  hat: () => [{ ...goodFace(), headwearLikelihood: "VERY_LIKELY" }],
  lowconf: () => [{ ...goodFace(), detectionConfidence: 0.5 }],
};

const split = (b: Buffer) => b.toString("utf8").split("|");

export const fakeNormaliser: ImageNormaliser = {
  async normalise(raw) {
    if (raw.toString("utf8").startsWith("corrupt")) throw new Error("unreadable");
    return { jpeg: raw, width: 1000, height: 800 };
  },
};

export const fakeVision: FaceDetector = {
  async detectFaces(jpeg) {
    const kind = split(jpeg)[0] as string;
    if (kind === "visionerror") throw new Error("vision down");
    return (VISION[kind] ?? VISION["ok"]!)();
  },
};

export const fakeEmbedder: Embedder = {
  async embed(jpeg) {
    if (split(jpeg)[0] === "embederror") throw new Error("face service down");
    return (split(jpeg)[1] as string).split(",").map(Number);
  },
};

export class RecordingLogger implements Logger {
  entries: { level: string; message: string; fields: Record<string, string | number | boolean> }[] = [];
  info(message: string, fields: Record<string, string | number | boolean> = {}) {
    this.entries.push({ level: "info", message, fields });
  }
  warn(message: string, fields: Record<string, string | number | boolean> = {}) {
    this.entries.push({ level: "warn", message, fields });
  }
}

export function makeDeps() {
  const books = new MemoryBooks();
  const blobs = new MemoryBlobs();
  const log = new RecordingLogger();
  const deps: PhotoCheckDeps = {
    books,
    blobs,
    images: fakeNormaliser,
    vision: fakeVision,
    embedder: fakeEmbedder,
    log,
    now: () => 1_700_000_000_000,
  };
  return { deps, books, blobs, log };
}
