import type { BookStatus, PhotoFailReason, VisionFace } from "@gycb/shared";

export interface BookRecord {
  ownerUid: string;
  status: BookStatus;
}

export interface PhotoRecord {
  checkStatus: "pending" | "pass" | "fail";
  failReason?: PhotoFailReason;
  storagePath?: string;
  faceBox?: { x: number; y: number; w: number; h: number }; // fractions of the image
  qualityScores?: { faceWidthFraction: number; detectionConfidence: number };
  embeddingRef?: string;
  updatedAt: number;
}

/** Firestore side. Status changes are validated against the state machine and audited. */
export interface BookStore {
  getBook(bookId: string): Promise<BookRecord | null>;
  /** Moves status from -> to only if it is currently `from`. Returns false if another worker already moved it. */
  transition(bookId: string, from: BookStatus, to: BookStatus, actor: string): Promise<boolean>;
  setPhoto(bookId: string, photoId: string, record: PhotoRecord): Promise<void>;
  getPhotos(bookId: string): Promise<Record<string, PhotoRecord>>;
}

/** Cloud Storage side (private uploads bucket). */
export interface BlobStore {
  download(path: string): Promise<Buffer>;
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface NormalisedImage {
  jpeg: Buffer;
  width: number;
  height: number;
}

/** HEIC to JPEG, orientation applied, EXIF (including GPS) stripped, long edge capped. Throws if unreadable. */
export interface ImageNormaliser {
  normalise(raw: Buffer, maxLongEdgePx: number): Promise<NormalisedImage>;
}

export interface FaceDetector {
  detectFaces(jpeg: Buffer): Promise<VisionFace[]>;
}

export interface Embedder {
  /** 512-d ArcFace embedding of the single face in the image. Never logged. */
  embed(jpeg: Buffer): Promise<number[]>;
}
