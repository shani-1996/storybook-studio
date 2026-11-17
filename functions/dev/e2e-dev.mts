/**
 * Dev tool: end-to-end test of the DEPLOYED photo-check function in the dev project.
 *   npx tsx dev/e2e-dev.mts <folder with 3 photos>
 * Creates temporary test books, uploads photos into the private uploads bucket (as the browser would),
 * waits for the real Cloud Function (real Cloud Vision, real face-score) and checks the result.
 * Everything it creates is deleted at the end. Prints IDs, statuses and timings only, never photo data.
 * Does not cover the browser or the security rules (the rules have their own emulator tests).
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

const PROJECT = "book-dev-env";
const BUCKET = `${PROJECT}-uploads`;
const folder = process.argv[2];
if (!folder) throw new Error("usage: tsx dev/e2e-dev.mts <folder>");

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();
const bucket = getStorage().bucket(BUCKET);

const files = readdirSync(folder).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().slice(0, 3);
if (files.length < 3) throw new Error("need 3 photos in the folder");

const created: string[] = [];
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

async function newBook(): Promise<string> {
  const id = `e2e-${randomBytes(6).toString("hex")}`;
  created.push(id);
  await db.doc(`books/${id}`).set({
    ownerUid: "e2e-test-user",
    storyId: "when-i-grow-up",
    child: { firstName: "Test", gender: "neutral", age: 5 },
    relationship: "parent",
    status: "draft",
    professions: ["doctor", "pilot", "astronaut", "scientist", "artist", "chef", "footballer", "cricketer"],
    dedicationText: "",
    createdAt: new Date(),
  });
  return id;
}

async function waitFor(id: string, done: (status: string) => boolean, timeoutMs: number): Promise<{ status: string; ms: number }> {
  const start = Date.now();
  for (;;) {
    const status = ((await db.doc(`books/${id}`).get()).data() as { status: string }).status;
    if (done(status) || Date.now() - start > timeoutMs) return { status, ms: Date.now() - start };
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const photoDocs = async (id: string) =>
  Object.fromEntries((await db.collection(`books/${id}/photos`).get()).docs.map((d) => [d.id, d.data()]));
const objects = async (id: string) => (await bucket.getFiles({ prefix: `books/${id}/` }))[0].map((f) => f.name.split("/").pop() as string).sort();

async function cleanup() {
  for (const id of created) {
    try {
      await bucket.deleteFiles({ prefix: `books/${id}/`, force: true });
      const photos = await db.collection(`books/${id}/photos`).get();
      await Promise.all(photos.docs.map((d) => d.ref.delete()));
      const audits = await db.collection("audit").where("bookId", "==", id).get();
      await Promise.all(audits.docs.map((d) => d.ref.delete()));
      await db.doc(`books/${id}`).delete();
    } catch (e) {
      console.log(`cleanup problem for ${id}: ${e instanceof Error ? e.message.slice(0, 100) : "unknown"}`);
    }
  }
  console.log(`cleaned up ${created.length} test books and their files`);
}

try {
  // ---- Scenario 1: three good photos of the same child ----
  const good = await newBook();
  const originals = files.map((f) => readFileSync(join(folder, f)));
  const originalHasExif = (await sharp(originals[0]!).metadata()).exif !== undefined;
  const t0 = Date.now();
  await Promise.all(originals.map((buf, i) => bucket.file(`books/${good}/photos/photo${i + 1}`).save(buf, { contentType: "image/jpeg", resumable: false })));
  const r1 = await waitFor(good, (s) => s === "photos_ready" || s === "photos_failed", 180_000);
  check("3 good photos reach photos_ready", r1.status === "photos_ready", `status=${r1.status}, ${(r1.ms / 1000).toFixed(1)} s after upload (3 photos in parallel, includes cold start)`);

  const docs = await photoDocs(good);
  check("every photo passed", Object.values(docs).filter((d) => (d as { checkStatus: string }).checkStatus === "pass").length === 3, JSON.stringify(Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, (v as { checkStatus: string }).checkStatus]))));

  const names = await objects(good);
  check("raw uploads deleted, cleaned photo + embedding kept", JSON.stringify(names) === JSON.stringify(["photo1.embedding.json", "photo1.jpg", "photo2.embedding.json", "photo2.jpg", "photo3.embedding.json", "photo3.jpg"].sort()), names.join(", "));

  const cleaned = (await bucket.file(`books/${good}/photos/photo1.jpg`).download())[0];
  const meta = await sharp(cleaned).metadata();
  check("cleaned photo has no EXIF/GPS", meta.exif === undefined, `original had EXIF: ${originalHasExif}`);
  check("cleaned photo is within 2048 px", Math.max(meta.width ?? 0, meta.height ?? 0) <= 2048, `${meta.width}x${meta.height}`);

  const emb = JSON.parse((await bucket.file(`books/${good}/photos/photo1.embedding.json`).download())[0].toString("utf8")) as number[];
  check("embedding has 512 numbers", emb.length === 512);

  const audits = (await db.collection("audit").where("bookId", "==", good).get()).docs.map((d) => d.data() as { action: string; actor: string });
  check("status changes audited by the system", audits.some((a) => a.action === "status:photos_checking->photos_ready") && audits.every((a) => a.actor.startsWith("system:")), audits.map((a) => a.action).join(" | "));

  // ---- Scenario 2: a photo with no face ----
  const bad = await newBook();
  const noFace = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#8899aa" } }).jpeg().toBuffer();
  await bucket.file(`books/${bad}/photos/photo1`).save(noFace, { contentType: "image/jpeg", resumable: false });
  const r2 = await waitFor(bad, (s) => s === "photos_failed" || s === "photos_ready", 120_000);
  const d2 = (await photoDocs(bad))["photo1"] as { checkStatus: string; failReason?: string } | undefined;
  check("photo with no face is rejected with NO_FACE", r2.status === "photos_failed" && d2?.failReason === "NO_FACE", `status=${r2.status}, reason=${d2?.failReason}, ${(r2.ms / 1000).toFixed(1)} s`);
  check("rejected photo leaves no file behind", (await objects(bad)).length === 0);

  // ---- Scenario 3: consent endpoint refuses callers who are not signed in ----
  const res = await fetch(`https://asia-south1-${PROJECT}.cloudfunctions.net/submitConsent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: { bookId: good, version: "x" } }),
  });
  check("submitConsent rejects a caller who is not signed in", res.status === 401, `HTTP ${res.status}`);

  const consentUntouched = ((await db.doc(`books/${good}`).get()).data() as { consent?: unknown }).consent === undefined;
  check("no consent was written by the rejected call", consentUntouched);
} finally {
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
