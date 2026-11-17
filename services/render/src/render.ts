import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser } from "puppeteer-core";
import sharp from "sharp";
import type { PanelPlan } from "./layout.js";
import { ASSET_HOST, TYPE, buildPage, fitScript, type PageSpec } from "./page.js";

const FONT_DIR = fileURLToPath(new URL("../fonts/", import.meta.url));
const FONT_FILES = ["Andika-Regular.ttf", "Andika-Bold.ttf", "Fredoka-Variable.ttf", "NotoSansDevanagari-Variable.ttf"];

/** Any Chrome or Edge will do. In the container, CHROME_PATH points at the installed Chromium. */
export function findBrowser(): string {
  const candidates = [
    process.env["CHROME_PATH"],
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) throw new Error("No Chrome or Edge found. Set CHROME_PATH.");
  return found;
}

export interface FitReport {
  text: string;
  scale: number;
  fontPx: number;
  overflow: boolean;
}

export interface RenderedPage {
  png: Buffer;
  width: number;
  height: number;
  /** Where the words went on picture and cover pages. */
  plan?: PanelPlan;
  fit: FitReport[];
  /** Fonts that failed to load (0 when everything is fine). */
  fontErrors: number;
  /** True if the text still overflows at the smallest readable size, or had to sit over a face. A human should look. */
  needsHuman: boolean;
}

export class PageRenderer {
  private fonts = new Map<string, Buffer>();
  private constructor(private browser: Browser) {
    for (const f of FONT_FILES) this.fonts.set(`/fonts/${f}`, readFileSync(FONT_DIR + f));
  }

  static async launch(): Promise<PageRenderer> {
    const browser = await puppeteer.launch({
      executablePath: findBrowser(),
      headless: true,
      // --no-sandbox is needed inside Cloud Run containers; pages only ever show our own HTML.
      args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
    });
    return new PageRenderer(browser);
  }

  async close() {
    await this.browser.close();
  }

  /**
   * Renders one page to PNG. `images` maps the URL used in the spec (under https://assets.local) to its bytes.
   * Every other network request is blocked, so a render can never fetch anything from outside.
   */
  async render(spec: PageSpec, images: Record<string, { data: Buffer; mime: string }> = {}): Promise<RenderedPage> {
    const built = buildPage(spec);
    const page = await this.browser.newPage();
    try {
      await page.setViewport({ width: built.width, height: built.height, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (url.startsWith(ASSET_HOST)) {
          const path = url.slice(ASSET_HOST.length);
          const font = this.fonts.get(path);
          // Fonts count as another origin to the page, so the browser needs this header to accept them.
          if (font) return void req.respond({ status: 200, contentType: "font/ttf", body: font, headers: { "access-control-allow-origin": "*" } });
          const img = images[url];
          if (img) return void req.respond({ status: 200, contentType: img.mime, body: img.data });
          return void req.respond({ status: 404, body: "" });
        }
        if (url.startsWith("data:") || url === "about:blank") return void req.continue();
        return void req.abort(); // no outside network
      });
      await page.setContent(built.html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      const minPx = Math.round(built.width * TYPE.minReadable * 10) / 10;
      const fit = (await page.evaluate(fitScript(minPx))) as FitReport[];
      // A font that failed to load would silently fall back to a default look; count it as a problem.
      const fontErrors = (await page.evaluate(() => Array.from(document.fonts).filter((f) => f.status === "error").length)) as number;
      const png = Buffer.from(await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: built.width, height: built.height } }));
      const needsHuman = fontErrors > 0 || fit.some((f) => f.overflow) || built.plan?.overlapsFace === true;
      return { png, width: built.width, height: built.height, plan: built.plan, fit, fontErrors, needsHuman };
    } finally {
      await page.close();
    }
  }
}

/** Preview images are WebP, at most 1200 px wide (spec section 5). */
export async function toPreviewWebp(png: Buffer, maxWidth = 1200, quality = 82): Promise<Buffer> {
  return sharp(png).resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality }).toBuffer();
}
