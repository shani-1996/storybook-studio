import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, precheckPhoto, safeNext, titlePreview, uploadContentType } from "../lib/helpers";

describe("titlePreview", () => {
  it("shows the name as typed, trimmed", () => {
    expect(titlePreview("  Zoe ")).toBe("When Zoe Grows Up");
  });
  it("shows a blank until a name is entered", () => {
    expect(titlePreview("")).toBe("When ___ Grows Up");
    expect(titlePreview("   ")).toBe("When ___ Grows Up");
  });
  it("handles long and non-Latin names", () => {
    expect(titlePreview("A".repeat(20))).toBe(`When ${"A".repeat(20)} Grows Up`);
    expect(titlePreview("इशानी")).toContain("इशानी");
  });
});

describe("safeNext (no open redirect)", () => {
  it("keeps same-site paths, with query strings", () => {
    expect(safeNext("/create/photos?book=abc")).toBe("/create/photos?book=abc");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "", null, undefined, "/ok\nbad"])(
    "falls back for %j",
    (bad) => {
      expect(safeNext(bad as string | null | undefined)).toBe("/create/details");
    },
  );
  it("uses a custom fallback", () => {
    expect(safeNext("http://x", "/home")).toBe("/home");
  });
});

describe("precheckPhoto", () => {
  const f = (name: string, size: number, type: string) => ({ name, size, type });
  it("accepts jpeg, png, heic and heif", () => {
    for (const [n, t] of [["a.jpg", "image/jpeg"], ["a.png", "image/png"], ["a.heic", "image/heic"], ["a.heif", "image/heif"]]) {
      expect(precheckPhoto(f(n!, 1000, t!))).toBeNull();
    }
  });
  it("accepts HEIC reported with an empty type (some phones)", () => {
    expect(precheckPhoto(f("IMG_1.HEIC", 1000, ""))).toBeNull();
  });
  it("rejects non-images and unknown types", () => {
    expect(precheckPhoto(f("a.pdf", 1000, "application/pdf"))).toBe("NOT_AN_IMAGE");
    expect(precheckPhoto(f("a.svg", 1000, "image/svg+xml"))).toBe("NOT_AN_IMAGE");
    expect(precheckPhoto(f("a.txt", 1000, ""))).toBe("NOT_AN_IMAGE");
  });
  it("rejects empty files and files of 15 MB or more", () => {
    expect(precheckPhoto(f("a.jpg", 0, "image/jpeg"))).toBe("EMPTY");
    expect(precheckPhoto(f("a.jpg", MAX_PHOTO_BYTES, "image/jpeg"))).toBe("TOO_LARGE");
    expect(precheckPhoto(f("a.jpg", MAX_PHOTO_BYTES - 1, "image/jpeg"))).toBeNull();
  });
});

describe("uploadContentType", () => {
  it("keeps allowed types and repairs an empty type from the extension", () => {
    expect(uploadContentType({ name: "a.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(uploadContentType({ name: "a.HEIC", type: "" })).toBe("image/heic");
    expect(uploadContentType({ name: "a.png", type: "" })).toBe("image/png");
    expect(uploadContentType({ name: "a.jpeg", type: "" })).toBe("image/jpeg");
  });
});
