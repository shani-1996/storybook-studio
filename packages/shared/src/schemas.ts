import { z } from "zod";
import { BOOK_STATUSES } from "./status.js";

/** 1 to 20 letters; Unicode letters and combining marks allowed (e.g. Devanagari), plus apostrophe, hyphen, space. */
export const FirstName = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^\p{L}[\p{L}\p{M}'’ -]*$/u, "letters only");

export const Gender = z.enum(["girl", "boy", "neutral"]); // neutral = prefer not to say (they/them)
export const Age = z.number().int().min(1).max(7);
export const Relationship = z.enum(["parent", "grandparent", "aunt_uncle", "sibling", "family_friend", "other"]);

export const ChildDetails = z.object({ firstName: FirstName, gender: Gender, age: Age });
export type ChildDetails = z.infer<typeof ChildDetails>;

export const PROFESSIONS = [
  "doctor", "pilot", "astronaut", "scientist", "artist", "chef", "footballer", "cricketer",
  "engineer", "teacher", "musician", "firefighter", "veterinarian", "architect", "photographer", "explorer",
] as const;
export const ProfessionId = z.enum(PROFESSIONS);

export const DEFAULT_PROFESSIONS = PROFESSIONS.slice(0, 8);

/** Many stories share this platform. A story is a folder under content/stories/<storyId>/. */
export const StoryId = z.string().regex(/^[a-z0-9-]{1,40}$/);
export const DEFAULT_STORY_ID = "when-i-grow-up";

/** Fields a signed-in adult may write from the browser when creating a draft book. */
export const BookCreateInput = z.object({
  storyId: StoryId.default(DEFAULT_STORY_ID),
  child: ChildDetails,
  relationship: Relationship,
  professions: z.array(ProfessionId).length(8).refine((a) => new Set(a).size === 8, "professions must be unique"),
  dedicationText: z.string().max(400).default(""),
});
export type BookCreateInput = z.infer<typeof BookCreateInput>;

export const BookStatusSchema = z.enum(BOOK_STATUSES);

export const ConsentRecord = z.object({
  version: z.string().min(1),
  acceptedAt: z.number().int(),
  ipHash: z.string().length(64), // SHA-256 hex; never the raw IP
});

export const PricingConfig = z.object({
  hardcoverInr: z.number().int().positive(),
  softcoverInr: z.number().int().positive(),
  intlUsd: z.number().positive(),
});

export const LimitsConfig = z.object({
  previewsPerUser: z.number().int().min(0),
  regensPerBook: z.number().int().min(0),
  maxCandidatesPerPage: z.number().int().min(1).max(4),
  maxDailyPreviews: z.number().int().min(0),
  maxDailyImageCalls: z.number().int().min(0),
  faceScoreMin: z.number().min(0).max(1),
  judgeScoreMin: z.number().min(0).max(10),
  /** Extra rounds when no candidate passes. */
  retryLimit: z.number().int().min(0).max(5).default(2),
  heroCandidates: z.number().int().min(1).max(4).default(3),
  previewCandidates: z.number().int().min(1).max(4).default(2),
  /**
   * While the quality thresholds are still being tuned, a preview uses the best candidate even if none passes,
   * and marks it. Turn off once the likeness test has set good thresholds.
   */
  previewBestEffort: z.boolean().default(true),
});
export type LimitsConfig = z.infer<typeof LimitsConfig>;

/** Spec section 11 defaults. Values live in Firestore config/limits; these only seed it. */
export const DEFAULT_LIMITS: LimitsConfig = {
  previewsPerUser: 1,
  regensPerBook: 1,
  maxCandidatesPerPage: 4,
  maxDailyPreviews: 200,
  maxDailyImageCalls: 2000,
  faceScoreMin: 0.4,
  judgeScoreMin: 7,
  retryLimit: 2,
  heroCandidates: 3,
  previewCandidates: 2,
  previewBestEffort: true,
};

/** Version of the consent text shown to the parent (text lives in content/ui/en.json). Bump on any wording change. */
export const CONSENT_VERSION = "2026-11-draft-1";

export const ConsentInput = z.object({
  bookId: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
});
export type ConsentInput = z.infer<typeof ConsentInput>;
