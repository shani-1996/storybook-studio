import type { FaceScorer, ImageRef } from "../ports.js";

/** Thin HTTP client for the Python face-score service (local or Cloud Run). */
export function createFaceScoreClient(baseUrl: string): FaceScorer {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`face-score ${path} failed: ${r.status}`);
    return (await r.json()) as T;
  }
  const b64 = (r: ImageRef) => r.base64;
  return {
    async compare({ image, references }) {
      return post("/compare", { image: b64(image), references: references.map(b64) });
    },
    async detect(image) {
      const r = await post<{ boxes: { x: number; y: number; w: number; h: number }[] }>("/detect", { image: b64(image) });
      return r.boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    },
  };
}
