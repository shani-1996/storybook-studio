import { createHmac } from "node:crypto";
import { CONSENT_VERSION, ConsentInput, type BookStatus } from "@gycb/shared";

export type ConsentErrorCode = "invalid-argument" | "unauthenticated" | "permission-denied" | "failed-precondition";

export class ConsentError extends Error {
  constructor(public readonly code: ConsentErrorCode, message: string) {
    super(message);
  }
}

export interface ConsentBook {
  ownerUid: string;
  status: BookStatus;
  consent?: { version: string; acceptedAt: number; ipHash: string };
}

export interface ConsentStore {
  getBook(bookId: string): Promise<ConsentBook | null>;
  /** Writes the consent record and an audit entry (IDs only). */
  recordConsent(bookId: string, consent: { version: string; acceptedAt: number; ipHash: string }, actor: string): Promise<void>;
}

/** Raw IP addresses are never stored: HMAC-SHA256 with a secret pepper, so the hash cannot be brute-forced. */
export function hashIp(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update(ip).digest("hex");
}

export interface ConsentDeps {
  store: ConsentStore;
  pepper: string;
  now: () => number;
}

/**
 * Spec section 10, rule 1: only the signed-in owner records consent, against the current consent text version,
 * once the photos have passed their checks.
 */
export async function recordConsent(deps: ConsentDeps, uid: string | undefined, rawInput: unknown, ip: string): Promise<{ ok: true }> {
  if (!uid) throw new ConsentError("unauthenticated", "Please sign in.");

  const parsed = ConsentInput.safeParse(rawInput);
  if (!parsed.success) throw new ConsentError("invalid-argument", "Invalid request.");
  const { bookId, version } = parsed.data;

  if (version !== CONSENT_VERSION) {
    throw new ConsentError("failed-precondition", "The consent text has changed. Please reload the page and read it again.");
  }

  const book = await deps.store.getBook(bookId);
  // Same answer for "missing" and "not yours" so book IDs cannot be probed.
  if (!book || book.ownerUid !== uid) throw new ConsentError("permission-denied", "You cannot change this book.");

  if (book.consent?.version === version) return { ok: true }; // already recorded: idempotent

  if (book.status !== "photos_ready") {
    throw new ConsentError("failed-precondition", "Please finish uploading and checking your photos first.");
  }

  await deps.store.recordConsent(bookId, { version, acceptedAt: deps.now(), ipHash: hashIp(ip || "unknown", deps.pepper) }, uid);
  return { ok: true };
}
