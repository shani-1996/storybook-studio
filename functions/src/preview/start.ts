export interface AccessConfig {
  /** When true anyone may start a preview. While false, only the listed testers can (it costs real money per preview). */
  open: boolean;
  testerEmails: string[];
}

export interface StartDeps {
  getAccess(): Promise<AccessConfig>;
  /** Adds the preview job to the queue. A second call for the same book is harmless. */
  enqueue(bookId: string): Promise<void>;
  /** Records why no preview was started, so the page can say so. */
  markBlocked(bookId: string, reason: "not_invited"): Promise<void>;
}

export type StartOutcome = "queued" | "not_invited";

const normalise = (e: string) => e.trim().toLowerCase();

/** Called after the parent's consent is saved. Only a signed-in owner of a consented book gets here. */
export async function startPreview(deps: StartDeps, bookId: string, email: string | undefined): Promise<StartOutcome> {
  const access = await deps.getAccess();
  const allowed = access.open || (email !== undefined && access.testerEmails.map(normalise).includes(normalise(email)));
  if (!allowed) {
    await deps.markBlocked(bookId, "not_invited");
    return "not_invited";
  }
  await deps.enqueue(bookId);
  return "queued";
}
