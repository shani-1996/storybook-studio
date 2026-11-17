import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { DEFAULT_LIMITS, LimitsConfig, assertTransition, auditForTransition, type BookStatus } from "@gycb/shared";
import type { PageRecord, PreviewBook, PreviewStore } from "../../genkit-flows/src/preview/ports.js";

/** Firestore side of the preview job. Counters use atomic increments so parallel workers cannot lose a count. */
export class FirestorePreviewStore implements PreviewStore {
  constructor(private readonly db: Firestore = getFirestore()) {}

  async getBook(bookId: string): Promise<PreviewBook | null> {
    const snap = await this.db.doc(`books/${bookId}`).get();
    if (!snap.exists) return null;
    const d = snap.data() as Record<string, unknown>;
    return {
      ownerUid: d["ownerUid"] as string,
      status: d["status"] as BookStatus,
      child: d["child"] as PreviewBook["child"],
      relationship: (d["relationship"] as string) ?? "other",
      professions: (d["professions"] as string[]) ?? [],
      dedicationText: (d["dedicationText"] as string) ?? "",
      consent: d["consent"] as PreviewBook["consent"],
      heroSheetPath: d["heroSheetPath"] as string | undefined,
    };
  }

  /** Limits live in config/limits; anything missing falls back to the spec defaults. */
  async getLimits() {
    const snap = await this.db.doc("config/limits").get();
    return LimitsConfig.parse({ ...DEFAULT_LIMITS, ...(snap.exists ? snap.data() : {}) });
  }

  async getUserPreviewCount(uid: string) {
    const snap = await this.db.doc(`users/${uid}`).get();
    return (snap.data()?.["previewsUsed"] as number | undefined) ?? 0;
  }

  async incrementUserPreviewCount(uid: string) {
    await this.db.doc(`users/${uid}`).set({ previewsUsed: FieldValue.increment(1) }, { merge: true });
  }

  async getDailyCounters(day: string) {
    const d = (await this.db.doc(`usage/${day}`).get()).data() ?? {};
    return { previewsStarted: (d["previewsStarted"] as number) ?? 0, imageCalls: (d["imageCalls"] as number) ?? 0 };
  }

  async addDailyCounters(day: string, delta: { previewsStarted?: number; imageCalls?: number }) {
    const update: Record<string, unknown> = {};
    if (delta.previewsStarted) update["previewsStarted"] = FieldValue.increment(delta.previewsStarted);
    if (delta.imageCalls) update["imageCalls"] = FieldValue.increment(delta.imageCalls);
    if (Object.keys(update).length) await this.db.doc(`usage/${day}`).set(update, { merge: true });
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

  async setBookFields(bookId: string, fields: Record<string, unknown>) {
    await this.db.doc(`books/${bookId}`).update(fields);
  }

  /** The cleaned photos that passed their checks (paths in the uploads bucket). */
  async getPassedPhotoPaths(bookId: string): Promise<string[]> {
    const snap = await this.db.collection(`books/${bookId}/photos`).get();
    return snap.docs
      .filter((d) => d.data()["checkStatus"] === "pass" && typeof d.data()["storagePath"] === "string")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((d) => d.data()["storagePath"] as string);
  }

  async getPages(bookId: string): Promise<Record<string, PageRecord>> {
    const snap = await this.db.collection(`books/${bookId}/pages`).get();
    return Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as PageRecord]));
  }

  async setPage(bookId: string, r: PageRecord) {
    await this.db.doc(`books/${bookId}/pages/${r.pageNo}`).set(JSON.parse(JSON.stringify(r)));
  }

  async audit(entry: { actor: string; action: string; bookId: string }) {
    await this.db.collection("audit").add({ ...entry, at: Date.now() });
  }

  /** Mail documents carry ids only. The mail step looks the address up from the user id. */
  async enqueueMail(mail: { template: "preview-ready" | "preview-failed"; uid: string; bookId: string }) {
    await this.db.collection("mail").add({ ...mail, createdAt: Date.now(), sent: false });
  }
}
