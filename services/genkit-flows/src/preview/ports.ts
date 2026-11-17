import type { BookStatus, LimitsConfig, TextGender } from "@gycb/shared";
import type { ImageRef } from "../ports.js";
import type { PageTemplate } from "../schemas.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreviewBook {
  ownerUid: string;
  status: BookStatus;
  child: { firstName: string; gender: TextGender; age: number };
  relationship: string;
  professions: string[];
  dedicationText: string;
  consent?: { version: string };
  heroSheetPath?: string;
}

/** What is kept about each preview page. Never the picture itself (that lives in Storage). */
export interface PageRecord {
  pageNo: number;
  kind: "cover" | "dedication" | "intro" | "art" | "text";
  status: "ready" | "needs_human";
  professionId?: string;
  selectedCandidate?: string;
  /** True when the best candidate did not pass the thresholds but was used anyway (best-effort mode). */
  belowThreshold?: boolean;
  candidates: { id: string; faceScore?: number; judgeScore?: number; passed?: boolean; model: string; costUsd: number | null; latencyMs: number }[];
  webpPath: string;
  /** The parent may see this page. */
  visibleToOwner: boolean;
}

export type BlockedReason = "user_limit" | "daily_cap" | "image_cap";

export interface PreviewStore {
  getBook(bookId: string): Promise<PreviewBook | null>;
  getLimits(): Promise<LimitsConfig>;
  getUserPreviewCount(uid: string): Promise<number>;
  incrementUserPreviewCount(uid: string): Promise<void>;
  getDailyCounters(day: string): Promise<{ previewsStarted: number; imageCalls: number }>;
  addDailyCounters(day: string, delta: { previewsStarted?: number; imageCalls?: number }): Promise<void>;
  /** Moves the status only if it is currently `from`; writes an audit entry. */
  transition(bookId: string, from: BookStatus, to: BookStatus, actor: string): Promise<boolean>;
  setBookFields(bookId: string, fields: Record<string, unknown>): Promise<void>;
  getPassedPhotoPaths(bookId: string): Promise<string[]>;
  getPages(bookId: string): Promise<Record<string, PageRecord>>;
  setPage(bookId: string, record: PageRecord): Promise<void>;
  audit(entry: { actor: string; action: string; bookId: string }): Promise<void>;
  /** Writes a mail document. The mail step looks the address up from the user id; the name is never put in a subject. */
  enqueueMail(mail: { template: "preview-ready" | "preview-failed"; uid: string; bookId: string }): Promise<void>;
}

export interface PreviewBlobs {
  readPhoto(path: string): Promise<Buffer>;
  putGenerated(path: string, data: Buffer, contentType: string): Promise<void>;
  getGenerated(path: string): Promise<Buffer>;
  removeGenerated(path: string): Promise<void>;
  putPreview(path: string, data: Buffer): Promise<void>;
}

export type RenderRequest =
  | { kind: "cover"; image: ImageRef; faces: Rect[]; name: string; textSide: "left" | "right" }
  | { kind: "art"; image: ImageRef; faces: Rect[]; title: string; lines: string[]; textSide: "left" | "right" }
  | { kind: "text"; title: string; fact: string; motivation: string }
  | { kind: "message"; title: string; lines: string[]; footer?: string };

export interface PageRenderer {
  /** Preview pages are always watermarked. */
  render(req: RenderRequest): Promise<{ webp: Buffer; needsHuman: boolean }>;
}

export interface StoryCopy {
  intro: { rhyme: string[] };
  closing: { signoff: Record<string, string> };
  professions: Record<string, { title: string; rhyme: string[]; funFact: string; motivation: string }>;
  approvedByOwner?: boolean;
}

export interface StoryContent {
  templates: Record<string, PageTemplate>;
  copy: StoryCopy;
}

export interface PreviewLogger {
  info(message: string, fields?: Record<string, string | number | boolean>): void;
  warn(message: string, fields?: Record<string, string | number | boolean>): void;
}
