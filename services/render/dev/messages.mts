/** Dev tool: renders a dedication and the opening verse with made-up names so a person can look at them. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PageRenderer } from "../src/render.js";

const out = process.argv[2];
if (!out) throw new Error("usage: tsx dev/messages.mts <output folder>");
mkdirSync(out, { recursive: true });
const r = await PageRenderer.launch();
try {
  const ded = await r.render({ kind: "message", title: "Dear Zoe", lines: ["Love you to the moon and back. May every day bring you something new to learn and someone kind to share it with."], footer: "With all our love", watermark: true, widthPx: 1600 });
  writeFileSync(join(out, "dedication.png"), ded.png);
  const intro = await r.render({ kind: "message", title: "", lines: ["When Zoe grows up, what will Zoe be?", "There is so much to try and so much to see!", "Let us visit some jobs, one by one,", "and find out which ones are the most fun!"], watermark: true, widthPx: 1600 });
  writeFileSync(join(out, "intro.png"), intro.png);
  console.log("needsHuman:", ded.needsHuman, intro.needsHuman, "fit:", JSON.stringify(ded.fit.map((f) => +f.scale.toFixed(2))));
} finally {
  await r.close();
}
