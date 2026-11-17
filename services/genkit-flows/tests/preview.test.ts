import { CONSENT_VERSION } from "@gycb/shared";
import { describe, expect, it } from "vitest";
import { PAGE, runPreview } from "../src/preview/orchestrator.js";
import { DAY, makePreview } from "./previewFakes.js";

const B = "b1";

describe("happy path", () => {
  it("takes a book from photos_ready to preview_ready", async () => {
    const t = makePreview();
    expect(await runPreview(t.deps, B)).toBe("done");
    expect(t.store.status(B)).toBe("preview_ready");
    expect(t.store.statusChanges).toEqual(["photos_ready>preview_generating", "preview_generating>preview_ready"]);
  });

  it("makes the five preview pages with the right numbers and files", async () => {
    const t = makePreview();
    await runPreview(t.deps, B);
    expect([1, 2, 3, 4, 5].map((n) => t.store.page(B, n)?.kind)).toEqual(["cover", "dedication", "intro", "art", "text"]);
    expect(PAGE).toEqual({ cover: 1, dedication: 2, intro: 3, art: 4, text: 5 });
    for (const n of [1, 2, 3, 4, 5]) expect(t.blobs.previews.has(`books/${B}/preview/${n}.webp`)).toBe(true);
    expect([1, 2, 3, 4, 5].every((n) => t.store.page(B, n)?.visibleToOwner)).toBe(true);
  });

  it("uses the parent's first profession for the picture page", async () => {
    const t = makePreview();
    t.store.seed(B, { professions: ["pilot", "doctor", "astronaut", "scientist", "artist", "chef", "footballer", "cricketer"] });
    await runPreview(t.deps, B);
    expect(t.store.page(B, PAGE.art)?.professionId).toBe("pilot");
    expect(t.store.page(B, PAGE.text)?.professionId).toBe("pilot");
  });

  it("keeps only the chosen pictures: hero, cover and the picture page", async () => {
    const t = makePreview();
    await runPreview(t.deps, B);
    expect([...t.blobs.generated.keys()].map((k) => k.replace(/[0-9a-f-]{36}/, "<id>")).sort()).toEqual([
      `books/${B}/hero/<id>.png`,
      `books/${B}/pages/1/<id>.png`,
      `books/${B}/pages/4/<id>.png`,
    ]);
    expect(t.store.field(B, "heroSheetPath")).toMatch(/^books\/b1\/hero\/.+\.png$/);
  });

  it("uses the configured number of image calls: hero 3, cover 2, picture 2", async () => {
    const t = makePreview();
    await runPreview(t.deps, B);
    expect(t.calls()).toBe(7);
    expect(t.store.daily.get(DAY)).toEqual({ previewsStarted: 1, imageCalls: 7 });
  });

  it("counts the preview against the user and tells them", async () => {
    const t = makePreview();
    await runPreview(t.deps, B);
    expect(t.store.userCounts.get("owner")).toBe(1);
    expect(t.store.mails).toEqual([{ template: "preview-ready", uid: "owner", bookId: B }]);
    expect(t.store.audits).toContainEqual({ actor: "system:preview", action: "preview:ready", bookId: B });
  });

  it("records the cost estimate", async () => {
    const t = makePreview();
    t.deps.gen.models.usdPerMillionInputTokens = 1;
    t.deps.gen.models.usdPerMillionOutputTokens = 100;
    await runPreview(t.deps, B);
    expect(t.store.field(B, "costEstimateUsd") as number).toBeGreaterThan(0);
  });

  it("running it again does nothing and spends nothing", async () => {
    const t = makePreview();
    await runPreview(t.deps, B);
    const calls = t.calls();
    expect(await runPreview(t.deps, B)).toBe("already_done");
    expect(t.calls()).toBe(calls);
    expect(t.store.userCounts.get("owner")).toBe(1);
  });

  it("when two workers start together only one runs", async () => {
    const t = makePreview();
    const [a, b] = await Promise.all([runPreview(t.deps, B), runPreview(t.deps, B)]);
    expect([a, b].sort()).toEqual(["done", "ignored"]);
    expect(t.calls()).toBe(7);
  });
});

describe("words on the pages", () => {
  it("puts the child's name and the right wording on every page", async () => {
    const t = makePreview();
    await runPreview(t.deps, B);
    const byKind = Object.fromEntries(t.renderer.requests.map((r) => [r.kind + (r.kind === "message" ? r.title : ""), r]));
    const cover = t.renderer.requests.find((r) => r.kind === "cover");
    expect(cover && "name" in cover ? cover.name : "").toBe("Zoe");
    const art = t.renderer.requests.find((r) => r.kind === "art");
    expect(art && "lines" in art ? art.lines.join(" ") : "").toContain("Zoe");
    expect(art && "lines" in art ? art.lines.join(" ") : "").not.toContain("{");
    expect(byKind["messageDear Zoe"]).toBeDefined();
    const text = t.renderer.requests.find((r) => r.kind === "text");
    expect(text && "motivation" in text ? text.motivation : "").toBe("Keep being kind, Zoe!");
  });

  it("uses the dedication the parent wrote, or a warm default, and the sign-off for who gives the book", async () => {
    const t = makePreview();
    t.store.seed(B, { dedicationText: "Love you to the moon", relationship: "parent" });
    await runPreview(t.deps, B);
    const ded = t.renderer.requests.find((r) => r.kind === "message" && r.title.startsWith("Dear"));
    expect(ded && "lines" in ded ? ded.lines : []).toEqual(["Love you to the moon"]);
    expect(ded && "footer" in ded ? ded.footer : "").toBe("With all our love");

    const t2 = makePreview();
    t2.store.seed(B, { dedicationText: "   ", relationship: "sibling" });
    await runPreview(t2.deps, B);
    const ded2 = t2.renderer.requests.find((r) => r.kind === "message" && r.title.startsWith("Dear"));
    expect(ded2 && "lines" in ded2 ? ded2.lines[0] : "").toContain("made with love");
    expect(ded2 && "footer" in ded2 ? ded2.footer : "").toBe("With love"); // unknown relationship falls back
  });

  it("keeps the face boxes with the picture so the words can avoid the face", async () => {
    const t = makePreview();
    await runPreview(t.deps, B);
    for (const kind of ["cover", "art"] as const) {
      const r = t.renderer.requests.find((x) => x.kind === kind);
      expect(r && "faces" in r ? r.faces : []).toEqual([{ x: 0.15, y: 0.3, w: 0.2, h: 0.3 }]);
    }
  });

  it("marks a page that needs a human but still shows it", async () => {
    const t = makePreview();
    t.renderer.needsHuman = true;
    expect(await runPreview(t.deps, B)).toBe("done");
    expect(t.store.page(B, PAGE.art)?.status).toBe("needs_human");
    expect(t.store.page(B, PAGE.art)?.visibleToOwner).toBe(true);
  });
});

describe("limits (checked before anything is spent)", () => {
  it("stops a user who already used their free preview", async () => {
    const t = makePreview();
    t.store.userCounts.set("owner", 1);
    expect(await runPreview(t.deps, B)).toBe("limited");
    expect(t.store.field(B, "previewBlocked")).toBe("user_limit");
    expect(t.store.status(B)).toBe("photos_ready");
    expect(t.calls()).toBe(0);
  });
  it("stops when the daily preview cap is reached", async () => {
    const t = makePreview();
    t.store.daily.set(DAY, { previewsStarted: 200, imageCalls: 0 });
    expect(await runPreview(t.deps, B)).toBe("limited");
    expect(t.store.field(B, "previewBlocked")).toBe("daily_cap");
    expect(t.calls()).toBe(0);
  });
  it("stops when there is not enough of the daily image budget left", async () => {
    const t = makePreview();
    t.store.daily.set(DAY, { previewsStarted: 0, imageCalls: 1995 });
    expect(await runPreview(t.deps, B)).toBe("limited");
    expect(t.store.field(B, "previewBlocked")).toBe("image_cap");
    expect(t.calls()).toBe(0);
  });
  it("the limits come from config, so the owner can change them", async () => {
    const t = makePreview();
    t.store.limits = { ...t.store.limits, previewsPerUser: 3 };
    t.store.userCounts.set("owner", 2);
    expect(await runPreview(t.deps, B)).toBe("done");
  });
  it("a book blocked earlier starts normally once the block is gone", async () => {
    const t = makePreview();
    t.store.userCounts.set("owner", 1);
    await runPreview(t.deps, B);
    t.store.userCounts.set("owner", 0);
    expect(await runPreview(t.deps, B)).toBe("done");
    expect(t.store.field(B, "previewBlocked")).toBeNull();
  });
});

describe("refuses to start when it should not", () => {
  it("unknown book", async () => {
    expect(await runPreview(makePreview().deps, "nope")).toBe("ignored");
  });
  it("no consent, or consent for an older text", async () => {
    const a = makePreview();
    a.store.seed(B, { consent: undefined });
    expect(await runPreview(a.deps, B)).toBe("ignored");
    const b = makePreview();
    b.store.seed(B, { consent: { version: "old" } });
    expect(await runPreview(b.deps, B)).toBe("ignored");
    expect(a.calls() + b.calls()).toBe(0);
  });
  it.each(["draft", "photos_checking", "photos_failed", "paid", "book_generating", "delivered"] as const)("book is %s", async (status) => {
    const t = makePreview();
    t.store.seed(B, { status });
    expect(await runPreview(t.deps, B)).toBe("ignored");
    expect(t.store.status(B)).toBe(status);
    expect(t.calls()).toBe(0);
  });
  it("consent text version is the current one", () => {
    expect(CONSENT_VERSION.length).toBeGreaterThan(3);
  });
});

describe("quality and retries", () => {
  it("retries with different seeds when no candidate passes, then uses a passing one", async () => {
    // Hero: first round (3 candidates) fails, second round passes.
    const t = makePreview({ similarity: (i) => (i < 3 ? 0.1 : 0.7) });
    expect(await runPreview(t.deps, B)).toBe("done");
    expect(t.seeds.slice(0, 3)).toEqual([1000, 1001, 1002]);
    expect(t.seeds.slice(3, 6)).toEqual([1100, 1101, 1102]); // different seeds on the retry
    expect(t.calls()).toBe(3 + 3 + 2 + 2);
  });

  it("uses the best candidate and marks it when none ever passes (best effort on)", async () => {
    const t = makePreview({ similarity: () => 0.2 });
    expect(await runPreview(t.deps, B)).toBe("done");
    expect(t.store.page(B, PAGE.cover)?.belowThreshold).toBe(true);
    expect(t.store.page(B, PAGE.art)?.belowThreshold).toBe(true);
    // 3 rounds each (first + 2 retries): hero 9, cover 6, picture 6.
    expect(t.calls()).toBe(9 + 6 + 6);
  });

  it("fails honestly when none passes and best effort is off", async () => {
    const t = makePreview({ similarity: () => 0.2 });
    t.store.limits = { ...t.store.limits, previewBestEffort: false };
    expect(await runPreview(t.deps, B)).toBe("failed");
    expect(t.store.status(B)).toBe("preview_failed");
  });

  it("does not use a candidate with no face as the best effort", async () => {
    const t = makePreview({ similarity: () => -1 });
    expect(await runPreview(t.deps, B)).toBe("failed");
  });

  it("stops retrying when the daily image budget runs out, instead of overspending", async () => {
    const t = makePreview({ similarity: () => 0.2 });
    t.store.daily.set(DAY, { previewsStarted: 0, imageCalls: 1985 }); // 15 left: enough to start (7) but not for every retry
    await runPreview(t.deps, B);
    expect(t.calls()).toBeLessThanOrEqual(15);
  });
});

describe("failures", () => {
  it("a render error fails the preview, does not count against the user, and tells them", async () => {
    const t = makePreview();
    t.renderer.failOn = "art";
    expect(await runPreview(t.deps, B)).toBe("failed");
    expect(t.store.status(B)).toBe("preview_failed");
    expect(t.store.userCounts.get("owner") ?? 0).toBe(0);
    expect(t.store.mails).toEqual([{ template: "preview-failed", uid: "owner", bookId: B }]);
    expect(t.store.audits).toContainEqual({ actor: "system:preview", action: "alert:preview_failed", bookId: B });
  });

  it("the money already spent is still counted toward the daily budget", async () => {
    const t = makePreview();
    t.renderer.failOn = "art";
    await runPreview(t.deps, B);
    expect(t.store.daily.get(DAY)?.imageCalls).toBe(7);
  });

  it("fewer than three checked photos fails cleanly", async () => {
    const t = makePreview();
    t.store.photoPaths = ["books/b1/photos/photo1.jpg"];
    expect(await runPreview(t.deps, B)).toBe("failed");
    expect(t.calls()).toBe(0);
  });

  it("a refusal from the image model blocks the book for an admin", async () => {
    const t = makePreview({ blocked: true });
    expect(await runPreview(t.deps, B)).toBe("blocked");
    expect(t.store.status(B)).toBe("generation_blocked");
    expect(t.store.audits).toContainEqual({ actor: "system:preview", action: "alert:generation_blocked", bookId: B });
    expect(t.store.userCounts.get("owner") ?? 0).toBe(0);
    expect(t.store.mails[0]?.template).toBe("preview-failed");
  });

  it("a missing template fails cleanly", async () => {
    const t = makePreview();
    t.store.seed(B, { professions: ["scientist", "doctor", "pilot", "astronaut", "artist", "chef", "footballer", "cricketer"] });
    expect(await runPreview(t.deps, B)).toBe("failed");
  });
});

describe("resuming after a crash", () => {
  it("does not repeat the hero or pages that were already finished", async () => {
    const t = makePreview();
    // Simulate an earlier attempt that finished the hero and the cover and then died.
    t.store.seed(B, { status: "preview_generating" });
    t.store.books.get(B)!.fields["heroSheetPath"] = `books/${B}/hero/earlier.png`;
    t.blobs.generated.set(`books/${B}/hero/earlier.png`, Buffer.from("earlier hero"));
    await t.store.setPage(B, { pageNo: PAGE.cover, kind: "cover", status: "ready", candidates: [], webpPath: "x", visibleToOwner: true });
    expect(await runPreview(t.deps, B)).toBe("done");
    expect(t.calls()).toBe(2); // only the picture page: no hero (3) and no cover (2)
    expect(t.store.daily.get(DAY)?.previewsStarted ?? 0).toBe(0); // not counted twice
    expect(t.store.statusChanges).toEqual(["preview_generating>preview_ready"]);
  });
});

describe("privacy", () => {
  it("logs and audit entries never contain the child's name", async () => {
    const t = makePreview();
    t.renderer.failOn = "art";
    await runPreview(t.deps, B);
    const text = JSON.stringify([t.logs, t.store.audits, t.store.mails]);
    expect(text).not.toContain("Zoe");
  });

  it("the mail request carries ids only", async () => {
    const t = makePreview();
    await runPreview(t.deps, B);
    expect(Object.keys(t.store.mails[0]!).sort()).toEqual(["bookId", "template", "uid"]);
  });
});
