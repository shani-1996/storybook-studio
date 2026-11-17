import sharp from "sharp";
import type { ImageRef } from "../../genkit-flows/src/ports.js";
import type { PageRenderer, RenderRequest } from "../../genkit-flows/src/preview/ports.js";
import type { PageSpec } from "../../render/src/page.js";
import { PageRenderer as Browser, toPreviewWebp } from "../../render/src/render.js";

const PREVIEW_WIDTH_PX = 1200;

/** Turns the job's render requests into page specs, renders them with Chromium and returns watermarked WebP. */
export function chromiumRenderer(browser: Browser): PageRenderer {
  return {
    async render(req: RenderRequest) {
      const images: Record<string, { data: Buffer; mime: string }> = {};
      const withImage = async (img: ImageRef) => {
        const data = Buffer.from(img.base64, "base64");
        const meta = await sharp(data).metadata();
        const url = "https://assets.local/img/page";
        images[url] = { data, mime: img.mimeType };
        return { url, width: meta.width ?? 1, height: meta.height ?? 1 };
      };
      const base = { watermark: true, widthPx: PREVIEW_WIDTH_PX } as const;
      let spec: PageSpec;
      switch (req.kind) {
        case "cover":
          spec = { kind: "cover", image: { ...(await withImage(req.image)), faces: req.faces }, textSide: req.textSide, name: req.name, ...base };
          break;
        case "art":
          spec = { kind: "art", image: { ...(await withImage(req.image)), faces: req.faces }, textSide: req.textSide, title: req.title, lines: req.lines, ...base };
          break;
        case "text":
          spec = { kind: "text", title: req.title, fact: req.fact, motivation: req.motivation, ...base };
          break;
        case "message":
          spec = { kind: "message", title: req.title, lines: req.lines, footer: req.footer, ...base };
          break;
      }
      const out = await browser.render(spec, images);
      return { webp: await toPreviewWebp(out.png, PREVIEW_WIDTH_PX), needsHuman: out.needsHuman };
    },
  };
}
