/**
 * Dev tool: renders sample pages from real pictures so a person can look at them.
 *   npx tsx dev/sample.mts <folder with baseline pictures> <cover picture> <output folder>
 * Asks the deployed face-score service where each face is (your gcloud login), lays the words out away from the
 * face, and writes PNGs. Uses made-up sample names only. Output contains the child's pictures: keep it out of the repo.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { PageRenderer, toPreviewWebp } from "../src/render.js";
import type { Rect } from "../src/layout.js";
import type { PageSpec } from "../src/page.js";

const [folder, coverPath, outDir] = process.argv.slice(2);
if (!folder || !coverPath || !outDir) throw new Error("usage: tsx dev/sample.mts <pictures> <cover> <out>");
mkdirSync(outDir, { recursive: true });

const FACE_URL = "https://face-score-420016114828.asia-south1.run.app";
const copy = JSON.parse(readFileSync(new URL("../../../content/stories/when-i-grow-up/copy.en.json", import.meta.url), "utf8")) as {
  professions: Record<string, { title: string; rhyme: string[]; funFact: string; motivation: string }>;
};
const fill = (s: string, name: string) => s.replace(/\{name\}/g, name);

async function detectFaces(jpeg: Buffer): Promise<Rect[]> {
  const token = execSync("gcloud auth print-identity-token", { encoding: "utf8", shell: "cmd.exe" }).trim();
  const r = await fetch(`${FACE_URL}/detect`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ image: jpeg.toString("base64") }),
  });
  if (!r.ok) throw new Error(`detect ${r.status}`);
  return ((await r.json()) as { boxes: Rect[] }).boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
}

async function prepare(path: string, key: string) {
  const resized = await sharp(readFileSync(path)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const meta = await sharp(resized).metadata();
  const faces = await detectFaces(resized);
  const url = `https://assets.local/img/${key}.jpg`;
  return { url, data: resized, width: meta.width!, height: meta.height!, faces };
}

const renderer = await PageRenderer.launch();
try {
  const files = readdirSync(folder).filter((f) => /\.png$/i.test(f));
  const pick = (p: string) => files.find((f) => f.startsWith(`${p}-`));

  const jobs: { file: string; spec: PageSpec; images: Record<string, { data: Buffer; mime: string }> }[] = [];

  for (const id of ["doctor", "pilot", "astronaut", "chef"]) {
    const f = pick(id);
    if (!f) continue;
    const img = await prepare(join(folder, f), id);
    console.log(`${id}: faces found ${img.faces.length}`);
    const p = copy.professions[id]!;
    jobs.push({
      file: `${id}-art.png`,
      spec: { kind: "art", image: { url: img.url, width: img.width, height: img.height, faces: img.faces }, textSide: "right", title: p.title, lines: p.rhyme.map((l) => fill(l, "Zoe")), watermark: false, widthPx: 1600 },
      images: { [img.url]: { data: img.data, mime: "image/jpeg" } },
    });
  }

  const doctor = copy.professions["doctor"]!;
  jobs.push({ file: "doctor-text.png", spec: { kind: "text", title: doctor.title, fact: doctor.funFact, motivation: fill(doctor.motivation, "Zoe"), watermark: false, widthPx: 1600 }, images: {} });

  const cover = await prepare(coverPath, "cover");
  console.log(`cover: faces found ${cover.faces.length}`);
  for (const [label, name] of [["short", "Zoe"], ["long20", "Maximiliana-Josephin"], ["devanagari", "आरव"]] as const) {
    jobs.push({
      file: `cover-${label}.png`,
      spec: { kind: "cover", image: { url: cover.url, width: cover.width, height: cover.height, faces: cover.faces }, textSide: "right", name, watermark: label === "short", widthPx: 1600 },
      images: { [cover.url]: { data: cover.data, mime: "image/jpeg" } },
    });
  }

  for (const j of jobs) {
    const out = await renderer.render(j.spec, j.images);
    writeFileSync(join(outDir, j.file), out.png);
    const webp = await toPreviewWebp(out.png);
    writeFileSync(join(outDir, j.file.replace(".png", ".webp")), webp);
    const plan = out.plan ? `panel on ${out.plan.side} (attempt ${out.plan.attempt}, face overlap ${out.plan.overlapsFace})` : "text page";
    const small = Math.min(...out.fit.map((f) => f.scale));
    console.log(`${j.file}: ${out.width}x${out.height}, ${plan}, smallest text scale ${small.toFixed(2)}, needs human: ${out.needsHuman}, webp ${Math.round(webp.length / 1024)} KB`);
  }
} finally {
  await renderer.close();
}
