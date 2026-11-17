/** Errors worth trying again: the service was briefly unavailable, overloaded or restarting. */
export function isTransient(e: unknown): boolean {
  const err = e as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const status = Number(err?.response?.status ?? err?.status ?? err?.code);
  return [408, 429, 500, 502, 503, 504].includes(status) || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(String((e as Error)?.message ?? ""));
}

/** Retries `fn` on transient errors with growing delays. Non-transient errors fail immediately. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { retries = 2, baseMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !isTransient(e)) throw e;
      await sleep(baseMs * 2 ** attempt);
    }
  }
}

/** Safe description of an error for logs: its type and code only, never its message or any request data. */
export function describeError(e: unknown): { errorName: string; errorCode: string } {
  const err = e as { name?: unknown; code?: unknown; status?: unknown; response?: { status?: unknown } };
  return {
    errorName: typeof err?.name === "string" ? err.name : "Error",
    errorCode: String(err?.response?.status ?? err?.code ?? err?.status ?? "none"),
  };
}
