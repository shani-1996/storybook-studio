import { describe, expect, it } from "vitest";
import { PHOTO_FAIL_REASONS } from "@gycb/shared";
import { checkPhoto, cleanPath, embeddingPath, oddOneOut, parseRawPhotoPath, rawPath, type PhotoId } from "../src/photoCheck/handler.js";
import { makeDeps, photo } from "./fakes.js";

const BOOK = "book1";
const IDS: PhotoId[] = ["photo1", "photo2", "photo3"];

async function upload(ctx: ReturnType<typeof makeDeps>, id: PhotoId, data: Buffer) {
  ctx.blobs.files.set(rawPath(BOOK, id), data);
  return checkPhoto(ctx.deps, BOOK, id);
}

describe("parseRawPhotoPath", () => {
  it("accepts only the three raw slots", () => {
    expect(parseRawPhotoPath("books/abc/photos/photo1")).toEqual({ bookId: "abc", photoId: "photo1" });
    expect(parseRawPhotoPath("books/abc_D-1/photos/photo3")).toEqual({ bookId: "abc_D-1", photoId: "photo3" });
  });
  it("ignores our own outputs and anything else", () => {
    for (const p of [
      "books/abc/photos/photo1.jpg",
      "books/abc/photos/photo1.embedding.json",
      "books/abc/photos/photo4",
      "books/abc/photos/photo0",
      "books/abc/hero/photo1",
      "books/abc/photos/photo1/extra",
      "books/../photos/photo1",
      "photos/photo1",
      "",
    ]) {
      expect(parseRawPhotoPath(p)).toBeNull();
    }
  });
});

describe("happy path", () => {
  it("three good photos of the same child reach photos_ready", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    expect(await upload(ctx, "photo1", photo("ok", "1,0,0"))).toBe("checking");
    expect(ctx.books.status(BOOK)).toBe("photos_checking");
    expect(await upload(ctx, "photo2", photo("ok", "1,0.1,0"))).toBe("checking");
    expect(await upload(ctx, "photo3", photo("ok", "1,-0.1,0"))).toBe("photos_ready");
    expect(ctx.books.status(BOOK)).toBe("photos_ready");
  });

  it("keeps the cleaned photo and embedding, and removes the raw upload", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    await upload(ctx, "photo1", photo("ok"));
    expect(ctx.blobs.has(rawPath(BOOK, "photo1"))).toBe(false);
    expect(ctx.blobs.has(cleanPath(BOOK, "photo1"))).toBe(true);
    expect(ctx.blobs.has(embeddingPath(BOOK, "photo1"))).toBe(true);
  });

  it("records face box as fractions of the image and quality scores", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    await upload(ctx, "photo1", photo("ok"));
    const p = ctx.books.photo(BOOK, "photo1")!;
    expect(p.checkStatus).toBe("pass");
    expect(p.faceBox).toEqual({ x: 0.3, y: 0.25, w: 0.3, h: 0.375 });
    expect(p.qualityScores).toEqual({ faceWidthFraction: 0.3, detectionConfidence: 0.97 });
    expect(p.storagePath).toBe(cleanPath(BOOK, "photo1"));
  });

  it("writes one audit entry per status change, by the system actor", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    for (const id of IDS) await upload(ctx, id, photo("ok"));
    expect(ctx.books.audit.map((a) => `${a.from}>${a.to}`)).toEqual(["draft>photos_checking", "photos_checking>photos_ready"]);
    expect(ctx.books.audit.every((a) => a.actor === "system:photo-check" && a.bookId === BOOK)).toBe(true);
  });

  it("survives all three photos being checked at the same time", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    for (const id of IDS) ctx.blobs.files.set(rawPath(BOOK, id), photo("ok"));
    await Promise.all(IDS.map((id) => checkPhoto(ctx.deps, BOOK, id)));
    expect(ctx.books.status(BOOK)).toBe("photos_ready");
  });
});

describe("failures show the right reason", () => {
  const cases: [string, string][] = [
    ["none", "NO_FACE"],
    ["two", "MULTIPLE_FACES"],
    ["small", "FACE_TOO_SMALL"],
    ["lowconf", "LOW_CONFIDENCE"],
    ["blur", "BLURRY"],
    ["dark", "UNDER_EXPOSED"],
    ["tilt", "HEAD_TILTED"],
    ["hat", "HEADWEAR"],
  ];
  it.each(cases)("%s -> %s", async (kind, reason) => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    expect(await upload(ctx, "photo1", photo(kind))).toBe("photos_failed");
    expect(ctx.books.photo(BOOK, "photo1")).toMatchObject({ checkStatus: "fail", failReason: reason });
    expect(ctx.books.status(BOOK)).toBe("photos_failed");
  });

  it("a failed photo leaves no file behind", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    await upload(ctx, "photo1", photo("blur"));
    expect([...ctx.blobs.files.keys()]).toEqual([]);
  });

  it("unreadable image -> UNREADABLE", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    await upload(ctx, "photo1", Buffer.from("corrupt|1,0,0"));
    expect(ctx.books.photo(BOOK, "photo1")).toMatchObject({ failReason: "UNREADABLE" });
  });

  it("service errors -> CHECK_FAILED so the parent can retry", async () => {
    for (const kind of ["visionerror", "embederror"]) {
      const ctx = makeDeps();
      ctx.books.seed(BOOK);
      await upload(ctx, "photo1", photo(kind));
      expect(ctx.books.photo(BOOK, "photo1")).toMatchObject({ checkStatus: "fail", failReason: "CHECK_FAILED" });
    }
  });

  it("logs which step failed and the error type, never the error message", async () => {
    for (const [kind, step] of [["visionerror", "vision"], ["embederror", "embed"]] as const) {
      const ctx = makeDeps();
      ctx.books.seed(BOOK);
      await upload(ctx, "photo1", photo(kind));
      const entry = ctx.log.entries.find((e) => e.message === "check step failed");
      expect(entry?.fields).toMatchObject({ bookId: BOOK, photoId: "photo1", step, errorName: "Error" });
      expect(JSON.stringify(ctx.log.entries)).not.toMatch(/vision down|face service down/);
    }
  });

  it("every failure code the handler can produce has parent-facing copy", async () => {
    const copy = (await import("../../content/ui/en.json", { with: { type: "json" } })).default.photoCheck.reasons as Record<string, string>;
    for (const r of PHOTO_FAIL_REASONS) expect(copy[r]?.length ?? 0).toBeGreaterThan(10);
  });
});

describe("replacing photos", () => {
  it("a failed photo can be replaced and the book recovers", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    await upload(ctx, "photo1", photo("ok"));
    await upload(ctx, "photo2", photo("blur"));
    expect(ctx.books.status(BOOK)).toBe("photos_failed");
    await upload(ctx, "photo3", photo("ok"));
    expect(ctx.books.status(BOOK)).toBe("photos_failed"); // photo2 still bad
    expect(await upload(ctx, "photo2", photo("ok", "1,0.05,0"))).toBe("photos_ready");
    expect(ctx.books.status(BOOK)).toBe("photos_ready");
  });

  it("replacing a good photo after ready sends the book back through checking", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    for (const id of IDS) await upload(ctx, id, photo("ok"));
    expect(ctx.books.status(BOOK)).toBe("photos_ready");
    expect(await upload(ctx, "photo2", photo("ok", "1,0.02,0"))).toBe("photos_ready");
    expect(ctx.books.audit.map((a) => a.to)).toContain("photos_checking");
  });
});

describe("same-child check", () => {
  it("flags the odd photo out as DIFFERENT_CHILD", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    await upload(ctx, "photo1", photo("ok", "1,0,0"));
    await upload(ctx, "photo2", photo("ok", "1,0.1,0"));
    expect(await upload(ctx, "photo3", photo("ok", "0,1,0"))).toBe("photos_failed");
    expect(ctx.books.photo(BOOK, "photo3")).toMatchObject({ checkStatus: "fail", failReason: "DIFFERENT_CHILD" });
    expect(ctx.books.photo(BOOK, "photo1")!.checkStatus).toBe("pass");
    expect(ctx.blobs.has(cleanPath(BOOK, "photo3"))).toBe(false);
    expect(ctx.books.status(BOOK)).toBe("photos_failed");
  });

  it("oddOneOut picks the least similar photo", () => {
    expect(oddOneOut([[1, 0], [1, 0.1], [0, 1]])).toBe(2);
    expect(oddOneOut([[0, 1], [1, 0], [1, 0.1]])).toBe(0);
  });
});

describe("safety", () => {
  it("ignores an unknown book and removes the upload", async () => {
    const ctx = makeDeps();
    ctx.blobs.files.set(rawPath("ghost", "photo1"), photo("ok"));
    expect(await checkPhoto(ctx.deps, "ghost", "photo1")).toBe("ignored");
    expect(ctx.blobs.has(rawPath("ghost", "photo1"))).toBe(false);
  });

  it.each(["preview_generating", "preview_ready", "paid", "book_generating", "delivered", "purged", "cancelled"] as const)(
    "ignores uploads once the book is %s and does not change its status",
    async (status) => {
      const ctx = makeDeps();
      ctx.books.seed(BOOK, status);
      expect(await upload(ctx, "photo1", photo("ok"))).toBe("ignored");
      expect(ctx.books.status(BOOK)).toBe(status);
      expect(ctx.blobs.has(rawPath(BOOK, "photo1"))).toBe(false);
    },
  );

  it("logs only IDs and reason codes, never photo data", async () => {
    const ctx = makeDeps();
    ctx.books.seed(BOOK);
    await upload(ctx, "photo1", photo("blur", "9,9,9"));
    await upload(ctx, "photo2", photo("ok", "9,9,9"));
    const allowed = new Set(["bookId", "photoId", "reason"]);
    const text = JSON.stringify(ctx.log.entries);
    expect(text).not.toContain("9,9,9");
    expect(text).not.toContain("blur|");
    for (const e of ctx.log.entries) for (const k of Object.keys(e.fields)) expect(allowed.has(k)).toBe(true);
  });
});
