import { describe, expect, it } from "vitest";
import { withBackoff } from "../src/retry.js";

const noSleep = async () => {};

describe("withBackoff", () => {
  it("retries quota errors then succeeds", async () => {
    let n = 0;
    const r = await withBackoff(async () => { if (++n < 3) throw new Error("RESOURCE_EXHAUSTED 429"); return "ok"; }, { sleep: noSleep });
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });
  it("does not retry non-retryable errors", async () => {
    let n = 0;
    await expect(withBackoff(async () => { n++; throw new Error("NOT_FOUND 404"); }, { sleep: noSleep })).rejects.toThrow("NOT_FOUND");
    expect(n).toBe(1);
  });
  it("gives up after the attempt limit", async () => {
    let n = 0;
    await expect(withBackoff(async () => { n++; throw new Error("429"); }, { attempts: 3, sleep: noSleep })).rejects.toThrow();
    expect(n).toBe(3);
  });
  it("uses doubling delays capped at max", async () => {
    const delays: number[] = [];
    await expect(withBackoff(async () => { throw new Error("429"); }, { attempts: 4, minMs: 10, maxMs: 25, sleep: async (ms) => { delays.push(ms); } })).rejects.toThrow();
    expect(delays).toEqual([10, 20, 25]);
  });
});
