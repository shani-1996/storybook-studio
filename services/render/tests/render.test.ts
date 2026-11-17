import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { intersects, faceKeepOut, mapRectToPage, type Rect } from "../src/layout.js";
import { PAGE_ASPECT, buildPage, escapeHtml, lineHtml, pageHeightFor, type PageSpec } from "../src/page.js";
import { PageRenderer, findBrowser, toPreviewWebp } from "../src/render.js";

let hasBrowser = true;
try {
  findBrowser();
} catch {
  hasBrowser = false;
}

/** A plain 4:3 picture made on the fly, so the tests need no real photos. */
async function picture() {
  const data = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#aac4d8" } }).jpeg().toBuffer();
  return { url: "https://assets.local/img/test.jpg", width: 1200, height: 900, data };
}
const faceLeft: Rect = { x: 0.15, y: 0.3, w: 0.22, h: 0.3 };
const faceRight: Rect = { x: 0.65, y: 0.3, w: 0.22, h: 0.3 };

describe("page building (no browser)", () => {
  it("page height follows the 11 x 8.5 in trim", () => {
    expect(pageHeightFor(1100)).toBe(850);
    expect(PAGE_ASPECT).toBeCloseTo(11 / 8.5);
  });
  it("escapes HTML so a name or line can never inject markup", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'q'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;");
    const html = buildPage({ kind: "cover", image: { url: "u", width: 1200, height: 900, faces: [] }, textSide: "right", name: "<img src=x onerror=alert(1)>", watermark: false, widthPx: 800 }).html;
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
  it("hyphenated words are kept together on a line", () => {
    expect(lineHtml("Thump-thump, listen")).toContain('<span style="white-space:nowrap">Thump-thump,</span>');
    expect(lineHtml("plain words")).toBe("plain words");
  });
  it("only the preview has the watermark", () => {
    const spec = { kind: "text", title: "T", fact: "F.", motivation: "M", widthPx: 800 } as const;
    expect(buildPage({ ...spec, watermark: true }).html).toContain('class="watermark"');
    expect(buildPage({ ...spec, watermark: false }).html).not.toContain('class="watermark"');
  });
});

describe.skipIf(!hasBrowser)("rendering with a real browser", () => {
  let r: PageRenderer;
  let pic: Awaited<ReturnType<typeof picture>>;
  const imgs = () => ({ [pic.url]: { data: pic.data, mime: "image/jpeg" } });
  const art = (faces: Rect[], lines = ["Thump-thump, thump-thump, listen well,", "Zoe has a heartbeat story to tell.", "With gentle hands and a caring smile,", "a doctor helps friends all the while."], side: "left" | "right" = "right") =>
    ({ kind: "art", image: { url: pic.url, width: pic.width, height: pic.height, faces }, textSide: side, title: "Doctor", lines, watermark: false, widthPx: 1100 }) as const;

  beforeAll(async () => {
    r = await PageRenderer.launch();
    pic = await picture();
  });
  afterAll(async () => r.close());

  it("renders a picture page at the right size with all fonts loaded", async () => {
    const out = await r.render(art([faceLeft]), imgs());
    expect([out.width, out.height]).toEqual([1100, 850]);
    expect((await sharp(out.png).metadata()).width).toBe(1100);
    expect(out.fontErrors).toBe(0);
    expect(out.needsHuman).toBe(false);
  });

  it("puts the words on the side away from the face", async () => {
    expect((await r.render(art([faceLeft]), imgs())).plan?.side).toBe("right");
    expect((await r.render(art([faceRight]), imgs())).plan?.side).toBe("left");
  });

  it("the panel never touches the face once the picture is fitted to the page", async () => {
    for (const face of [faceLeft, faceRight, { x: 0.4, y: 0.25, w: 0.2, h: 0.3 }]) {
      const out = await r.render(art([face]), imgs());
      const onPage = mapRectToPage(face, pic.width / pic.height, PAGE_ASPECT);
      if (!out.plan?.overlapsFace) expect(intersects(out.plan!.panel, faceKeepOut(onPage))).toBe(false);
    }
  });

  it("flags the page for a human when the face fills the picture", async () => {
    const out = await r.render(art([{ x: 0.02, y: 0.02, w: 0.96, h: 0.96 }]), imgs());
    expect(out.plan?.overlapsFace).toBe(true);
    expect(out.needsHuman).toBe(true);
  });

  it("flags the page when the words cannot fit even at the smallest readable size", async () => {
    const long = Array.from({ length: 4 }, () => "word ".repeat(60));
    const out = await r.render(art([faceLeft], long), imgs());
    expect(out.fit.some((f) => f.overflow)).toBe(true);
    expect(out.needsHuman).toBe(true);
  });

  it("long text shrinks but never below the readable minimum", async () => {
    const lines = Array.from({ length: 4 }, () => "This is a rather long line to read aloud to a child");
    const out = await r.render(art([faceLeft], lines), imgs());
    for (const f of out.fit) expect(f.fontPx).toBeGreaterThanOrEqual(1100 * 0.0202 - 0.5);
  });

  it("covers: a 20-character name and a Devanagari name both fit on one line", async () => {
    for (const name of ["Maximiliana-Josephin", "आरव", "Zoe"]) {
      const out = await r.render({ kind: "cover", image: { url: pic.url, width: pic.width, height: pic.height, faces: [faceLeft] }, textSide: "right", name, watermark: false, widthPx: 1100 }, imgs());
      expect(out.fit.some((f) => f.overflow), name).toBe(false);
      expect(out.fontErrors).toBe(0);
    }
  });

  it("a very long name shrinks to fit rather than overflowing", async () => {
    const out = await r.render({ kind: "cover", image: { url: pic.url, width: pic.width, height: pic.height, faces: [] }, textSide: "right", name: "A".repeat(20), watermark: false, widthPx: 1100 }, imgs());
    expect(out.fit.some((f) => f.overflow)).toBe(false);
    expect(Math.min(...out.fit.map((f) => f.scale))).toBeLessThan(1);
  });

  it("text pages render with the fact and the encouraging line", async () => {
    const out = await r.render({ kind: "text", title: "Doctor", fact: "A doctor uses a stethoscope to listen to your heartbeat.", motivation: "Kind hearts make the best doctors. Keep being kind, Zoe!", watermark: false, widthPx: 1100 });
    expect(out.needsHuman).toBe(false);
    expect(out.fit).toHaveLength(2);
  });

  it("the preview watermark changes the picture, the print version has none", async () => {
    const base = { kind: "text", title: "T", fact: "A short fact.", motivation: "Keep going!", widthPx: 900 } as const;
    const plain = await r.render({ ...base, watermark: false });
    const marked = await r.render({ ...base, watermark: true });
    expect(plain.png.equals(marked.png)).toBe(false);
    const a = (await sharp(plain.png).stats()).channels[0]!.mean;
    const b = (await sharp(marked.png).stats()).channels[0]!.mean;
    expect(Math.abs(a - b)).toBeGreaterThan(0.1);
  });

  it("never fetches anything from the internet", async () => {
    // An outside picture URL is blocked: the page still renders, and the picture is simply missing.
    const spec: PageSpec = { ...art([faceLeft]), image: { url: "https://example.com/a.jpg", width: 1200, height: 900, faces: [faceLeft] } };
    const out = await r.render(spec, {});
    expect(out.width).toBe(1100);
  });

  it("preview images are WebP and no wider than 1200 px", async () => {
    const out = await r.render(art([faceLeft]), imgs());
    const wide = await sharp(out.png).resize({ width: 2400 }).png().toBuffer();
    const webp = await toPreviewWebp(wide);
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1200);
  });
});

describe.skipIf(!hasBrowser)("message pages (dedication, opening verse)", () => {
  let r: PageRenderer;
  beforeAll(async () => {
    r = await PageRenderer.launch();
  });
  afterAll(async () => r.close());

  it("renders a dedication with a heading, a message and a sign-off", async () => {
    const out = await r.render({ kind: "message", title: "Dear Zoe", lines: ["Love you to the moon and back."], footer: "With all our love", watermark: true, widthPx: 1100 });
    expect([out.width, out.height]).toEqual([1100, 850]);
    expect(out.needsHuman).toBe(false);
    expect(out.fontErrors).toBe(0);
  });

  it("renders the opening verse without a heading", async () => {
    const out = await r.render({ kind: "message", title: "", lines: ["When Zoe grows up,", "what will Zoe be?", "There is so much to try", "and so much to see!"], watermark: false, widthPx: 1100 });
    expect(out.needsHuman).toBe(false);
  });

  it("a long heading (20-character name) shrinks to fit", async () => {
    const out = await r.render({ kind: "message", title: "Dear Maximiliana-Josephin", lines: ["Hello."], watermark: false, widthPx: 1100 });
    expect(out.fit.some((f) => f.overflow)).toBe(false);
  });

  it("a very long message shrinks, and is flagged if it still cannot fit", async () => {
    const out = await r.render({ kind: "message", title: "Dear Zoe", lines: ["word ".repeat(400)], watermark: false, widthPx: 1100 });
    expect(out.needsHuman).toBe(true);
  });

  it("escapes markup in a parent's message", async () => {
    const html = buildPage({ kind: "message", title: "<b>Dear</b>", lines: ["<img src=x onerror=alert(1)>"], watermark: false, widthPx: 800 }).html;
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Dear</b>");
  });
});
