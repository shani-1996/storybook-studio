import { ImageAnnotatorClient } from "@google-cloud/vision";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { GoogleAuth } from "google-auth-library";
import { assertTransition, auditForTransition, type BookStatus, type Likelihood, type VisionFace } from "@gycb/shared";
import type { ConsentBook, ConsentStore } from "../consent/handler.js";
import type { BlobStore, BookRecord, BookStore, Embedder, FaceDetector, PhotoRecord } from "../photoCheck/ports.js";

/** Cloud Storage: the private uploads bucket. */
export function gcsBlobs(bucketName: string): BlobStore {
  const bucket = () => getStorage().bucket(bucketName);
  return {
    async download(path) {
      const [data] = await bucket().file(path).download();
      return data;
    },
    async upload(path, data, contentType) {
      await bucket().file(path).save(data, { contentType, resumable: false });
    },
    async remove(path) {
      await bucket().file(path).delete();
    },
  };
}

/** Firestore: books, photo results, status changes with audit entries. */
export class FirestoreBooks implements BookStore, ConsentStore {
  constructor(private readonly db: Firestore = getFirestore()) {}

  async getBook(bookId: string): Promise<(BookRecord & ConsentBook) | null> {
    const snap = await this.db.doc(`books/${bookId}`).get();
    if (!snap.exists) return null;
    const d = snap.data() as { ownerUid: string; status: BookStatus; consent?: ConsentBook["consent"] };
    return { ownerUid: d.ownerUid, status: d.status, consent: d.consent };
  }

  async transition(bookId: string, from: BookStatus, to: BookStatus, actor: string): Promise<boolean> {
    const ref = this.db.doc(`books/${bookId}`);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || (snap.data() as { status: BookStatus }).status !== from) return false; // someone else moved it
      assertTransition(from, to);
      tx.update(ref, { status: to });
      tx.set(this.db.collection("audit").doc(), auditForTransition(actor, bookId, from, to));
      return true;
    });
  }

  async setPhoto(bookId: string, photoId: string, record: PhotoRecord): Promise<void> {
    await this.db.doc(`books/${bookId}/photos/${photoId}`).set(JSON.parse(JSON.stringify(record)));
  }

  async getPhotos(bookId: string): Promise<Record<string, PhotoRecord>> {
    const snap = await this.db.collection(`books/${bookId}/photos`).get();
    return Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as PhotoRecord]));
  }

  async recordConsent(bookId: string, consent: { version: string; acceptedAt: number; ipHash: string }, actor: string): Promise<void> {
    const batch = this.db.batch();
    batch.update(this.db.doc(`books/${bookId}`), { consent });
    batch.set(this.db.collection("audit").doc(), { actor, action: "consent:recorded", bookId, at: consent.acceptedAt });
    await batch.commit();
  }
}

const LIKELIHOODS: Likelihood[] = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"];
const likelihood = (v: unknown): Likelihood =>
  typeof v === "number" ? (LIKELIHOODS[v] ?? "UNKNOWN") : LIKELIHOODS.includes(v as Likelihood) ? (v as Likelihood) : "UNKNOWN";

/** Cloud Vision face detection (one call per uploaded photo; the first 1,000 a month are free). */
export function visionFaces(client = new ImageAnnotatorClient()): FaceDetector {
  return {
    async detectFaces(jpeg): Promise<VisionFace[]> {
      const [res] = await client.faceDetection({ image: { content: jpeg } });
      return (res.faceAnnotations ?? []).map((f) => ({
        boundingPoly: { vertices: (f.boundingPoly?.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 })) },
        detectionConfidence: f.detectionConfidence ?? 0,
        rollAngle: f.rollAngle ?? 0,
        panAngle: f.panAngle ?? 0,
        tiltAngle: f.tiltAngle ?? 0,
        blurredLikelihood: likelihood(f.blurredLikelihood),
        underExposedLikelihood: likelihood(f.underExposedLikelihood),
        headwearLikelihood: likelihood(f.headwearLikelihood),
      }));
    },
  };
}

/** The face-score Cloud Run service. It is private: calls carry a Google-signed ID token for its URL. */
export function faceScoreEmbedder(serviceUrl: string): Embedder {
  const auth = new GoogleAuth();
  return {
    async embed(jpeg) {
      const client = await auth.getIdTokenClient(serviceUrl);
      const res = await client.request<{ embedding: number[] }>({
        url: `${serviceUrl}/embed`,
        method: "POST",
        data: { image: jpeg.toString("base64") },
        timeout: 90_000,
      });
      return res.data.embedding;
    },
  };
}
