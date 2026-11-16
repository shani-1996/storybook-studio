import convert from "heic-convert";
import sharp from "sharp";
import type { ImageNormaliser } from "./ports.js";

const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"];

/** HEIC/HEIF files start with a size field, then "ftyp" and a brand. */
export function isHeic(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  return HEIC_BRANDS.includes(buf.toString("ascii", 8, 12));
}

/**
 * Spec section 6, step 1: HEIC to JPEG, apply orientation, strip EXIF (including GPS), cap the long edge.
 * sharp drops all metadata unless asked to keep it, and rotate() bakes the orientation into the pixels first.
 */
export const sharpNormaliser: ImageNormaliser = {
  async normalise(raw, maxLongEdgePx) {
    const input = isHeic(raw) ? Buffer.from(await convert({ buffer: raw, format: "JPEG", quality: 0.92 })) : raw;
    const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: maxLongEdgePx, height: maxLongEdgePx, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  },
};
