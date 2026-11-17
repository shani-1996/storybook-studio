import { CONSENT_VERSION, fillLines, fillText, type LimitsConfig } from "@gycb/shared";
import { generateHeroSheet, generatePage, type Deps, type PageResult } from "../pipeline.js";
import type { ImageRef } from "../ports.js";
import type { Candidate, ChildInput } from "../schemas.js";
import type {
  BlockedReason,
  PageRecord,
  PageRenderer,
  PreviewBlobs,
  PreviewLogger,
  PreviewStore,
  RenderRequest,
  StoryContent,
} from "./ports.js";

const ACTOR = "system:preview";

export type PreviewOutcome = "done" | "already_done" | "ignored" | "limited" | "blocked" | "failed";

export interface PreviewDeps {
  store: PreviewStore;
  blobs: PreviewBlobs;
  renderer: PageRenderer;
  content: StoryContent;
  /** Model calls and the face service. Limits and candidate counts come from the store at run time. */
  gen: Pick<Deps, "images" | "judge" | "faces" | "models">;
  style?: string;
  /** Shrinks a picture before it is sent as a reference (the hero portrait is large). */
  shrink?: (img: ImageRef) => Promise<ImageRef>;
  log: PreviewLogger;
  now: () => number;
}

/** Page numbers in the preview book. The full book keeps these numbers for the same pages. */
export const PAGE = { cover: 1, dedication: 2, intro: 3, art: 4, text: 5 } as const;

const DEFAULT_DEDICATION = "This book was made with love, just for you.";

class BlockedByModel extends Error {}

/** Error type and code only: never the message (it might contain prompts or names). */
function errorInfo(e: unknown): Record<string, string> {
  const err = e as { name?: unknown; code?: unknown; status?: unknown };
  return { errorName: typeof err?.name === "string" ? err.name : "Error", errorCode: String(err?.code ?? err?.status ?? "none") };
}

interface Budget {
  remaining: number;
  used: number;
}

interface Best {
  selected: Candidate | null;
  all: Candidate[];
  belowThreshold: boolean;
}

/**
 * Generates until a candidate passes, retrying with different seeds (spec section 6). If none ever passes and
 * best-effort is on, the best-scoring candidate with exactly one face is used and marked.
 * reserveAfter is the number of image calls the later stages still need: a retry never eats into it, so the
 * daily image budget cannot be overspent and a later page is never starved.
 */
async function bestOf(
  limits: LimitsConfig,
  budget: Budget,
  perRound: number,
  run: (round: number) => Promise<PageResult>,
  reserveAfter: number,
): Promise<Best> {
  const all: Candidate[] = [];
  for (let round = 0; round <= limits.retryLimit; round++) {
    if (round === 0 && budget.remaining < perRound) throw new Error("daily image budget used up");
    if (round > 0 && budget.remaining - perRound < reserveAfter) break; // daily image-call cap: stop gracefully
    const r = await run(round);
    budget.used += r.candidates.length;
    budget.remaining -= r.candidates.length;
    all.push(...r.candidates);
    if (r.blocked && all.length === 0) throw new BlockedByModel("no image returned");
    if (r.selected) return { selected: r.selected, all, belowThreshold: false };
  }
  if (limits.previewBestEffort) {
    const usable = all.filter((c) => (c.faceScore ?? -1) >= 0);
    if (usable.length) {
      const best = usable.reduce((a, b) => ((b.combined ?? 0) > (a.combined ?? 0) ? b : a));
      return { selected: best, all, belowThreshold: true };
    }
  }
  return { selected: null, all, belowThreshold: false };
}

const asRef = (c: Candidate): ImageRef => ({ base64: c.imageBase64, mimeType: c.mimeType });

const summary = (c: Candidate) => ({
  id: c.id,
  faceScore: c.faceScore,
  judgeScore: c.judge?.score,
  passed: c.passed,
  model: c.model,
  costUsd: c.costUsd,
  latencyMs: c.latencyMs,
});

/** Runs the whole free preview for a book whose photos are ready and whose parent has consented. Safe to run again. */
export async function runPreview(deps: PreviewDeps, bookId: string): Promise<PreviewOutcome> {
  const { store, log } = deps;

  const book = await store.getBook(bookId);
  if (!book) {
    log.warn("preview ignored: book missing", { bookId });
    return "ignored";
  }
  if (book.status === "preview_ready") return "already_done";
  if (book.status !== "photos_ready" && book.status !== "preview_generating") return "ignored";
  if (book.consent?.version !== CONSENT_VERSION) {
    log.warn("preview ignored: no consent for the current text", { bookId });
    return "ignored";
  }

  const limits = await store.getLimits();
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  const counters = await store.getDailyCounters(day);

  if (book.status === "photos_ready") {
    // Spec section 6, step 2.1 and section 11: stop early and say why, before spending anything.
    const needed = limits.heroCandidates + 2 * limits.previewCandidates;
    let blocked: BlockedReason | null = null;
    if ((await store.getUserPreviewCount(book.ownerUid)) >= limits.previewsPerUser) blocked = "user_limit";
    else if (counters.previewsStarted >= limits.maxDailyPreviews) blocked = "daily_cap";
    else if (counters.imageCalls + needed > limits.maxDailyImageCalls) blocked = "image_cap";
    if (blocked) {
      log.info("preview limited", { bookId, reason: blocked });
      await store.setBookFields(bookId, { previewBlocked: blocked });
      return "limited";
    }
    if (!(await store.transition(bookId, "photos_ready", "preview_generating", ACTOR))) return "ignored"; // another worker has it
    await store.setBookFields(bookId, { previewBlocked: null });
    await store.addDailyCounters(day, { previewsStarted: 1 });
  }

  const budget: Budget = { remaining: limits.maxDailyImageCalls - counters.imageCalls, used: 0 };
  const allCandidates: Candidate[] = [];

  try {
    const photoPaths = await store.getPassedPhotoPaths(bookId);
    if (photoPaths.length < 3) throw new Error("fewer than three checked photos");
    const photos: ImageRef[] = await Promise.all(
      photoPaths.map(async (p) => ({ base64: (await deps.blobs.readPhoto(p)).toString("base64"), mimeType: "image/jpeg" })),
    );

    const child: ChildInput = { firstName: book.child.firstName, gender: book.child.gender, age: book.child.age };
    const genDeps = (candidates: number): Deps => ({
      ...deps.gen,
      limits: { faceScoreMin: limits.faceScoreMin, judgeScoreMin: limits.judgeScoreMin },
      style: deps.style,
      models: { ...deps.gen.models, candidatesPerPage: candidates },
    });
    const shrink = deps.shrink ?? (async (i: ImageRef) => i);
    const existing = await store.getPages(bookId);

    // ---- Hero portrait: the anchor for likeness on every other page ----
    let heroRef: ImageRef;
    if (book.heroSheetPath) {
      heroRef = await shrink({ base64: (await deps.blobs.getGenerated(book.heroSheetPath)).toString("base64"), mimeType: "image/png" });
    } else {
      const heroT = deps.content.templates["hero"];
      if (!heroT) throw new Error("missing hero template");
      // First round is the normal hero; a retry uses different seeds so it does not repeat the same attempt.
      const hero = await bestOf(limits, budget, limits.heroCandidates, (round) =>
        round === 0
          ? generateHeroSheet(genDeps(limits.heroCandidates), child, heroT, photos)
          : generatePage(genDeps(limits.heroCandidates), child, heroT, photos, [], { seedBase: 1000 + round * 100 }),
        2 * limits.previewCandidates, // the cover and the picture page still need their first round
      );
      allCandidates.push(...hero.all);
      if (!hero.selected) throw new Error("no usable hero portrait");
      const path = `books/${bookId}/hero/${hero.selected.id}.png`;
      await deps.blobs.putGenerated(path, Buffer.from(hero.selected.imageBase64, "base64"), hero.selected.mimeType);
      await store.setBookFields(bookId, { heroSheetPath: path });
      heroRef = await shrink(asRef(hero.selected));
    }

    // ---- Picture pages: cover and the parent's first profession ----
    const professionId = book.professions[0] ?? "doctor";
    const pictureJobs = [
      { pageNo: PAGE.cover, kind: "cover" as const, templateId: "cover" },
      { pageNo: PAGE.art, kind: "art" as const, templateId: professionId },
    ];

    for (const job of pictureJobs) {
      if (existing[String(job.pageNo)]?.status === "ready") continue; // done on an earlier attempt
      const template = deps.content.templates[job.templateId];
      if (!template) throw new Error(`missing template ${job.templateId}`);

      const best = await bestOf(
        limits,
        budget,
        limits.previewCandidates,
        (round) => generatePage(genDeps(limits.previewCandidates), child, template, photos, [heroRef], { seedBase: 1000 + round * 100 }),
        job.kind === "cover" ? limits.previewCandidates : 0, // the picture page still needs its first round
      );
      allCandidates.push(...best.all);
      if (!best.selected) throw new Error(`no usable picture for page ${job.pageNo}`);

      const sel = best.selected;
      await deps.blobs.putGenerated(`books/${bookId}/pages/${job.pageNo}/${sel.id}.png`, Buffer.from(sel.imageBase64, "base64"), sel.mimeType);
      const faces = await deps.gen.faces.detect(asRef(sel));

      const copy = deps.content.copy;
      const prof = copy.professions[professionId];
      let req: RenderRequest;
      if (job.kind === "cover") {
        req = { kind: "cover", image: asRef(sel), faces, name: child.firstName, textSide: template.textSide };
      } else {
        if (!prof) throw new Error(`missing copy for ${professionId}`);
        req = { kind: "art", image: asRef(sel), faces, title: prof.title, lines: fillLines(prof.rhyme, { name: child.firstName, gender: child.gender }), textSide: template.textSide };
      }
      await renderAndStore(deps, bookId, job.pageNo, job.kind, req, {
        professionId: job.kind === "art" ? professionId : undefined,
        selectedCandidate: sel.id,
        belowThreshold: best.belowThreshold,
        candidates: best.all.map(summary),
      });
    }

    // ---- Pages made from words only (no image calls) ----
    const copy = deps.content.copy;
    const prof = copy.professions[professionId];
    if (!prof) throw new Error(`missing copy for ${professionId}`);
    const tc = { name: child.firstName, gender: child.gender };
    const dedication = book.dedicationText.trim() || DEFAULT_DEDICATION;
    const wordPages: { pageNo: number; kind: PageRecord["kind"]; req: RenderRequest }[] = [
      { pageNo: PAGE.dedication, kind: "dedication", req: { kind: "message", title: `Dear ${child.firstName}`, lines: [dedication], footer: copy.closing.signoff[book.relationship] ?? copy.closing.signoff["other"] } },
      { pageNo: PAGE.intro, kind: "intro", req: { kind: "message", title: "", lines: fillLines(copy.intro.rhyme, tc) } },
      { pageNo: PAGE.text, kind: "text", req: { kind: "text", title: prof.title, fact: prof.funFact, motivation: fillText(prof.motivation, tc) } },
    ];
    for (const p of wordPages) {
      if (existing[String(p.pageNo)]?.status === "ready") continue;
      await renderAndStore(deps, bookId, p.pageNo, p.kind, p.req, { professionId: p.kind === "text" ? professionId : undefined, candidates: [] });
    }

    // ---- Done: record cost, count the preview, tell the parent ----
    const cost = allCandidates.reduce((s, c) => s + (c.costUsd ?? 0), 0);
    await store.setBookFields(bookId, { costEstimateUsd: cost });
    await store.addDailyCounters(day, { imageCalls: budget.used });
    if (await store.transition(bookId, "preview_generating", "preview_ready", ACTOR)) {
      await store.incrementUserPreviewCount(book.ownerUid); // only a finished preview counts against the limit
      await store.audit({ actor: ACTOR, action: "preview:ready", bookId });
      await store.enqueueMail({ template: "preview-ready", uid: book.ownerUid, bookId });
    }
    log.info("preview ready", { bookId, imageCalls: budget.used });
    return "done";
  } catch (e) {
    await store.addDailyCounters(day, { imageCalls: budget.used }).catch(() => undefined);
    if (e instanceof BlockedByModel) {
      // The model refused (safety block even after a retry and the fallback): needs an admin.
      log.warn("preview blocked by the image model", { bookId });
      await store.transition(bookId, "preview_generating", "generation_blocked", ACTOR);
      await store.audit({ actor: ACTOR, action: "alert:generation_blocked", bookId });
      await store.enqueueMail({ template: "preview-failed", uid: book.ownerUid, bookId });
      return "blocked";
    }
    // Spec section 6: a failed preview does not count against the limit, and the parent is told.
    log.warn("preview failed", { bookId, ...errorInfo(e) });
    await store.transition(bookId, "preview_generating", "preview_failed", ACTOR);
    await store.audit({ actor: ACTOR, action: "alert:preview_failed", bookId });
    await store.enqueueMail({ template: "preview-failed", uid: book.ownerUid, bookId });
    return "failed";
  }
}

async function renderAndStore(
  deps: PreviewDeps,
  bookId: string,
  pageNo: number,
  kind: PageRecord["kind"],
  req: RenderRequest,
  extra: Pick<PageRecord, "candidates"> & Partial<Pick<PageRecord, "professionId" | "selectedCandidate" | "belowThreshold">>,
): Promise<void> {
  const { webp, needsHuman } = await deps.renderer.render(req);
  const webpPath = `books/${bookId}/preview/${pageNo}.webp`;
  await deps.blobs.putPreview(webpPath, webp);
  await deps.store.setPage(bookId, {
    pageNo,
    kind,
    status: needsHuman ? "needs_human" : "ready",
    webpPath,
    // Pages that need a person's eye are still shown in the preview; the review queue handles them for the full book.
    visibleToOwner: true,
    ...extra,
  });
}
