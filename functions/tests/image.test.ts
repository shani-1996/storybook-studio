import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { isHeic, sharpNormaliser } from "../src/photoCheck/image.js";

const solid = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#c88" } });

describe("sharpNormaliser", () => {
  it("caps the long edge and keeps the aspect ratio", async () => {
    const raw = await solid(4000, 3000).jpeg().toBuffer();
    const out = await sharpNormaliser.normalise(raw, 2048);
    expect(out.width).toBe(2048);
    expect(out.height).toBe(1536);
    expect((await sharp(out.jpeg).metadata()).format).toBe("jpeg");
  });

  it("never enlarges a small image", async () => {
    const out = await sharpNormaliser.normalise(await solid(800, 600).png().toBuffer(), 2048);
    expect([out.width, out.height]).toEqual([800, 600]);
  });

  it("converts PNG to JPEG", async () => {
    const out = await sharpNormaliser.normalise(await solid(100, 100).png().toBuffer(), 2048);
    expect((await sharp(out.jpeg).metadata()).format).toBe("jpeg");
  });

  it("strips EXIF including GPS", async () => {
    const raw = await solid(300, 200)
      .withExif({ IFD0: { Make: "TestCam", Copyright: "owner" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "28/1 36/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "77/1 12/1 0/1" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(raw).metadata()).exif).toBeDefined(); // the test file really has EXIF
    const out = await sharpNormaliser.normalise(raw, 2048);
    const meta = await sharp(out.jpeg).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.jpeg.includes(Buffer.from("TestCam"))).toBe(false);
    expect(out.jpeg.includes(Buffer.from("GPS"))).toBe(false);
  });

  it("applies the EXIF orientation to the pixels (sideways phone photo)", async () => {
    // Stored 300 wide x 200 tall with orientation 6 (rotate 90 degrees): it displays as 200 x 300.
    const raw = await solid(300, 200).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(raw).metadata()).orientation).toBe(6); // the test file really is tagged as rotated
    const out = await sharpNormaliser.normalise(raw, 2048);
    expect([out.width, out.height]).toEqual([200, 300]);
    expect((await sharp(out.jpeg).metadata()).orientation).toBeUndefined();
  });

  it("rejects data that is not an image", async () => {
    await expect(sharpNormaliser.normalise(Buffer.from("this is not a photo"), 2048)).rejects.toThrow();
    await expect(sharpNormaliser.normalise(Buffer.alloc(0), 2048)).rejects.toThrow();
  });

  it("rejects an image with an absurd pixel count (decompression bomb)", async () => {
    const huge = await sharp({ create: { width: 12000, height: 12000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer();
    await expect(sharpNormaliser.normalise(huge, 2048)).rejects.toThrow();
  }, 60_000);
});

describe("isHeic", () => {
  const header = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp"), Buffer.from(brand), Buffer.alloc(8)]);
  it("recognises the HEIC and HEIF brands", () => {
    for (const b of ["heic", "heix", "mif1", "heif"]) expect(isHeic(header(b))).toBe(true);
  });
  it("rejects other containers and short buffers", () => {
    expect(isHeic(header("avif"))).toBe(false);
    expect(isHeic(header("mp42"))).toBe(false);
    expect(isHeic(Buffer.from("short"))).toBe(false);
    expect(isHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]))).toBe(false);
  });
});
