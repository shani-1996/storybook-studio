/**
 * Dev tool: runs the real photo check (real Cloud Vision, real face-score service, real image cleanup)
 * on photos in a local folder, with in-memory storage and database. Nothing is saved anywhere.
 *   npx tsx dev/try-real.ts <folder with 3 photos>
 * Uses your gcloud login. Prints reason codes and timings only, never photo data.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { visionFaces } from "../src/adapters/google.js";
import { checkPhoto, PHOTO_IDS, rawPath } from "../src/photoCheck/handler.js";
import { sharpNormaliser } from "../src/photoCheck/image.js";
import { MemoryBlobs, MemoryBooks, RecordingLogger } from "../tests/fakes.js";

const folder = process.argv[2];
const url = process.argv[3] ?? "https://face-score-420016114828.asia-south1.run.app";
if (!folder) throw new Error("usage: tsx dev/try-real.ts <folder> [face-score url]");

const token = () => execSync("gcloud auth print-identity-token", { encoding: "utf8", shell: "cmd.exe" }).trim();
const embedder = {
  async embed(jpeg: Buffer) {
    const r = await fetch(`${url}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token()}` },
      body: JSON.stringify({ image: jpeg.toString("base64") }),
    });
    if (!r.ok) throw new Error(`face-score ${r.status}`);
    return ((await r.json()) as { embedding: number[] }).embedding;
  },
};

const files = readdirSync(folder).filter((f) => /\.(jpe?g|png|heic)$/i.test(f)).sort().slice(0, 3);
const books = new MemoryBooks();
const blobs = new MemoryBlobs();
const log = new RecordingLogger();
books.seed("dev-book");
const deps = { books, blobs, images: sharpNormaliser, vision: visionFaces(), embedder, log, now: () => Date.now() };

for (const [i, f] of files.entries()) {
  const id = PHOTO_IDS[i]!;
  blobs.files.set(rawPath("dev-book", id), readFileSync(join(folder, f)));
  const t = Date.now();
  const outcome = await checkPhoto(deps, "dev-book", id);
  const p = books.photo("dev-book", id);
  console.log(`${id}: ${p?.checkStatus}${p?.failReason ? " " + p.failReason : ""}  book=${books.status("dev-book")}  outcome=${outcome}  ${Date.now() - t} ms` +
    (p?.qualityScores ? `  faceWidth=${p.qualityScores.faceWidthFraction.toFixed(2)} conf=${p.qualityScores.detectionConfidence.toFixed(2)}` : ""));
}
console.log("final book status:", books.status("dev-book"));
