import { CONSENT_VERSION, DEFAULT_LIMITS, assertTransition, type BookStatus, type LimitsConfig } from "@gycb/shared";
import type { Deps } from "../src/pipeline.js";
import type { ImageRef } from "../src/ports.js";
import type { PreviewDeps } from "../src/preview/orchestrator.js";
import type { PageRecord, PageRenderer, PreviewBlobs, PreviewBook, PreviewStore, RenderRequest, StoryContent } from "../src/preview/ports.js";
import { goodJudge, makeDeps } from "./helpers.js";

export class MemoryPreviewStore implements PreviewStore {
  books = new Map<string, PreviewBook & { fields: Record<string, unknown> }>();
  limits: LimitsConfig = { ...DEFAULT_LIMITS };
  userCounts = new Map<string, number>();
  daily = new Map<string, { previewsStarted: number; imageCalls: number }>();
  pages = new Map<string, Map<string, PageRecord>>();
  audits: { actor: string; action: string; bookId: string }[] = [];
  statusChanges: string[] = [];
  mails: { template: string; uid: string; bookId: string }[] = [];
  photoPaths = ["books/b1/photos/photo1.jpg", "books/b1/photos/photo2.jpg", "books/b1/photos/photo3.jpg"];

  seed(bookId: string, over: Partial<PreviewBook> = {}) {
    this.books.set(bookId, {
      ownerUid: "owner",
      status: "photos_ready",
      child: { firstName: "Zoe", gender: "girl", age: 5 },
      relationship: "parent",
      professions: ["doctor", "pilot", "astronaut", "scientist", "artist", "chef", "footballer", "cricketer"],
      dedicationText: "",
      consent: { version: CONSENT_VERSION },
      fields: {},
      ...over,
    });
  }
  async getBook(id: string) {
    const b = this.books.get(id);
    return b ? { ...b, heroSheetPath: (b.fields["heroSheetPath"] as string | undefined) ?? b.heroSheetPath } : null;
  }
  async getLimits() {
    return this.limits;
  }
  async getUserPreviewCount(uid: string) {
    return this.userCounts.get(uid) ?? 0;
  }
  async incrementUserPreviewCount(uid: string) {
    this.userCounts.set(uid, (this.userCounts.get(uid) ?? 0) + 1);
  }
  async getDailyCounters(day: string) {
    return this.daily.get(day) ?? { previewsStarted: 0, imageCalls: 0 };
  }
  async addDailyCounters(day: string, d: { previewsStarted?: number; imageCalls?: number }) {
    const c = await this.getDailyCounters(day);
    this.daily.set(day, { previewsStarted: c.previewsStarted + (d.previewsStarted ?? 0), imageCalls: c.imageCalls + (d.imageCalls ?? 0) });
  }
  async transition(id: string, from: BookStatus, to: BookStatus) {
    const b = this.books.get(id);
    if (!b || b.status !== from) return false;
    assertTransition(from, to);
    b.status = to;
    this.statusChanges.push(`${from}>${to}`);
    return true;
  }
  async setBookFields(id: string, fields: Record<string, unknown>) {
    Object.assign(this.books.get(id)!.fields, fields);
  }
  async getPassedPhotoPaths() {
    return this.photoPaths;
  }
  async getPages(id: string) {
    return Object.fromEntries(this.pages.get(id) ?? []);
  }
  async setPage(id: string, r: PageRecord) {
    if (!this.pages.has(id)) this.pages.set(id, new Map());
    this.pages.get(id)!.set(String(r.pageNo), r);
  }
  async audit(e: { actor: string; action: string; bookId: string }) {
    this.audits.push(e);
  }
  async enqueueMail(m: { template: string; uid: string; bookId: string }) {
    this.mails.push(m);
  }
  status(id: string) {
    return this.books.get(id)!.status;
  }
  field(id: string, k: string) {
    return this.books.get(id)!.fields[k];
  }
  page(id: string, n: number) {
    return this.pages.get(id)?.get(String(n));
  }
}

export class MemoryPreviewBlobs implements PreviewBlobs {
  generated = new Map<string, Buffer>();
  previews = new Map<string, Buffer>();
  async readPhoto() {
    return Buffer.from("photo-bytes");
  }
  async putGenerated(path: string, data: Buffer) {
    this.generated.set(path, data);
  }
  async getGenerated(path: string) {
    const d = this.generated.get(path);
    if (!d) throw new Error("not found");
    return d;
  }
  async removeGenerated(path: string) {
    this.generated.delete(path);
  }
  async putPreview(path: string, data: Buffer) {
    this.previews.set(path, data);
  }
}

export class RecordingRenderer implements PageRenderer {
  requests: RenderRequest[] = [];
  failOn: RenderRequest["kind"] | null = null;
  needsHuman = false;
  async render(req: RenderRequest) {
    this.requests.push(req);
    if (this.failOn === req.kind) throw new Error("render failed");
    return { webp: Buffer.from(`webp-${req.kind}`), needsHuman: this.needsHuman };
  }
}

export const content: StoryContent = {
  templates: {
    hero: { id: "hero", titleWord: "HERO", textSide: "right", scene: "portrait", outfit: { girl: "top", boy: "top", neutral: "top" }, composition: "centred" },
    cover: { id: "cover", titleWord: "COVER", textSide: "right", scene: "cover", outfit: { girl: "dress", boy: "outfit", neutral: "outfit" }, composition: "left" },
    doctor: { id: "doctor", titleWord: "DOCTOR", textSide: "left", scene: "doctor", outfit: { girl: "coat", boy: "coat", neutral: "coat" }, composition: "left" },
    pilot: { id: "pilot", titleWord: "PILOT", textSide: "right", scene: "pilot", outfit: { girl: "jacket", boy: "jacket", neutral: "jacket" }, composition: "left" },
  },
  copy: {
    intro: { rhyme: ["When {name} grows up,", "what will {name} be?"] },
    closing: { signoff: { parent: "With all our love", other: "With love" } },
    professions: {
      doctor: { title: "Doctor", rhyme: ["Thump-thump, listen well,", "{name} has a story to tell."], funFact: "A doctor uses a stethoscope.", motivation: "Keep being kind, {name}!" },
      pilot: { title: "Pilot", rhyme: ["Up, up, up!", "{name} flies high."], funFact: "Planes fly above clouds.", motivation: "Keep dreaming, {name}!" },
    },
  },
};

export interface Scenario {
  /** Face similarity for each candidate in the order it is scored (default 0.7: passes). */
  similarity?: (callIndex: number) => number;
  /** The model returns no image at all. */
  blocked?: boolean;
}

/** Everything the preview job needs, with the cloud swapped for in-memory stand-ins. */
export function makePreview(s: Scenario = {}) {
  const store = new MemoryPreviewStore();
  const blobs = new MemoryPreviewBlobs();
  const renderer = new RecordingRenderer();
  const base = makeDeps();
  const seeds: number[] = [];
  let generated = 0;
  let scored = 0;
  const gen: PreviewDeps["gen"] = {
    models: base.models,
    images: {
      async generate({ seed }) {
        if (s.blocked) return null;
        seeds.push(seed ?? -1);
        generated++;
        return { base64: Buffer.from(`image-${generated}`).toString("base64"), mimeType: "image/png", usage: { inputTokens: 10, outputTokens: 1120 } };
      },
    },
    judge: { judge: async () => goodJudge },
    faces: {
      compare: async () => ({ similarity: (s.similarity ?? (() => 0.7))(scored++), faces: 1, largestFaceWidthFraction: 0.3 }),
      detect: async (_img: ImageRef) => [{ x: 0.15, y: 0.3, w: 0.2, h: 0.3 }],
    },
 };
  const logs: { level: string; message: string; fields: Record<string, string | number | boolean> }[] = [];
  const deps: PreviewDeps = {
    store,
    blobs,
    renderer,
    content,
    gen,
    log: {
      info: (message, fields = {}) => logs.push({ level: "info", message, fields }),
      warn: (message, fields = {}) => logs.push({ level: "warn", message, fields }),
    },
    now: () => Date.UTC(2026, 10, 17, 12, 0, 0),
  };
  store.seed("b1");
  return { deps, store, blobs, renderer, logs, seeds, calls: () => generated };
}

export const DAY = "2026-11-17";
