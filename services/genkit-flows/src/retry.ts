/** Exponential backoff for quota (429) and transient 5xx errors, per spec section 6. */
export function isRetryable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /RESOURCE_EXHAUSTED|429|UNAVAILABLE|503|500|DEADLINE_EXCEEDED/.test(m);
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; minMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { attempts = 6, minMs = 10_000, maxMs = 600_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRetryable(e) || i === attempts - 1) throw e;
      await sleep(Math.min(maxMs, minMs * 2 ** i));
    }
  }
  throw last;
}
