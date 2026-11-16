/** Book status state machine (spec section 5). Only Functions or Workflows may change status. */
export const BOOK_STATUSES = [
  "draft", "photos_checking", "photos_ready", "preview_generating", "preview_ready",
  "paid", "book_generating", "in_review", "approved", "print_ready",
  "sent_to_printer", "shipped", "delivered", "purged",
  // side states
  "photos_failed", "preview_failed", "generation_blocked", "cancelled", "refunded",
] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

const TRANSITIONS: Record<BookStatus, readonly BookStatus[]> = {
  draft: ["photos_checking", "cancelled", "purged"],
  photos_checking: ["photos_ready", "photos_failed", "cancelled"],
  photos_failed: ["photos_checking", "cancelled", "purged"], // parent replaces photos
  photos_ready: ["preview_generating", "photos_checking", "cancelled"],
  preview_generating: ["preview_ready", "preview_failed", "generation_blocked", "cancelled"],
  preview_failed: ["preview_generating", "cancelled", "purged"], // retry does not count against limits
  preview_ready: ["preview_generating", "paid", "cancelled", "purged"], // one free regeneration
  generation_blocked: ["preview_generating", "book_generating", "cancelled", "refunded"], // after admin action
  paid: ["book_generating", "refunded"],
  book_generating: ["in_review", "generation_blocked", "refunded"],
  in_review: ["approved", "book_generating", "refunded"], // regenerate pages sends it back
  approved: ["print_ready", "refunded"],
  print_ready: ["sent_to_printer", "refunded"], // refund allowed before sent_to_printer
  sent_to_printer: ["shipped"],
  shipped: ["delivered"],
  delivered: ["purged"],
  cancelled: ["purged"],
  refunded: ["purged"],
  purged: [],
};

export function allowedNext(from: BookStatus): readonly BookStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: BookStatus, to: BookStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(public readonly from: BookStatus, public readonly to: BookStatus) {
    super(`invalid book status transition: ${from} -> ${to}`);
  }
}

export function assertTransition(from: BookStatus, to: BookStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Audit entry written on every status change. Holds IDs only, never child data. */
export interface AuditEntry {
  actor: string; // uid, "system", or workflow name
  action: `status:${BookStatus}->${BookStatus}`;
  bookId: string;
  at: number;
}

export function auditForTransition(actor: string, bookId: string, from: BookStatus, to: BookStatus, at = Date.now()): AuditEntry {
  assertTransition(from, to);
  return { actor, action: `status:${from}->${to}`, bookId, at };
}
