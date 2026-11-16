/** Live smoke test: one text-only image per model. No child data. Costs a few cents. */
import { createVertexAdapters } from "../src/adapters/vertex.js";

const project = process.argv[2] ?? "book-dev-env";
const models = process.argv.slice(3);

const v = createVertexAdapters({ projectId: project, location: "global", resolution: "1K", aspectRatio: "4:3" }, "gemini-3-flash-preview");

for (const model of models) {
  const t = Date.now();
  try {
    const out = await v.images.generate({
      model,
      prompt: "Soft watercolour children's book illustration of a friendly teddy bear in a doctor's coat. No text.",
      refs: [],
    });
    console.log(model, out ? `OK image ${Math.round(out.base64.length / 1024)}KB tokens=${JSON.stringify(out.usage)}` : "NO IMAGE (blocked/empty)", `${Date.now() - t}ms`);
  } catch (e) {
    console.log(model, "ERROR", (e instanceof Error ? e.message : String(e)).slice(0, 300));
  }
}
