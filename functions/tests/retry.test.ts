import { describe, expect, it } from "vitest";
import { describeError, isTransient, withRetry } from "../src/retry.js";

const noSleep = async () => {};
const http = (status: number) => Object.assign(new Error(`HTTP ${status} with a secret body`), { response: { status } });

describe("isTransient", () => {
  it.each([408, 429, 500, 502, 503, 504])("treats HTTP %i as transient", (s) => expect(isTransient(http(s))).toBe(true));
  it.each([400, 401, 403, 404, 422])("does not retry HTTP %i", (s) => expect(isTransient(http(s))).toBe(false));
  it("treats connection resets and timeouts as transient", () => {
    expect(isTransient(new Error("read ECONNRESET"))).toBe(true);
    expect(isTransient(new Error("socket hang up"))).toBe(true);
  });
  it("does not retry unknown errors", () => expect(isTransient(new Error("boom"))).toBe(false));
});

describe("withRetry", () => {
  it("retries a transient failure then succeeds", async () => {
    let n = 0;
    expect(await withRetry(async () => { if (++n < 3) throw http(503); return "ok"; }, { sleep: noSleep })).toBe("ok");
    expect(n).toBe(3);
  });
  it("gives up after the retry limit", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw http(503); }, { retries: 2, sleep: noSleep })).rejects.toThrow();
    expect(n).toBe(3);
  });
  it("does not retry a permanent failure", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw http(403); }, { sleep: noSleep })).rejects.toThrow();
    expect(n).toBe(1);
  });
  it("waits longer each time", async () => {
    const waits: number[] = [];
    await expect(withRetry(async () => { throw http(503); }, { retries: 3, baseMs: 10, sleep: async (ms) => { waits.push(ms); } })).rejects.toThrow();
    expect(waits).toEqual([10, 20, 40]);
  });
});

describe("describeError", () => {
  it("reports type and code, never the message", () => {
    const d = describeError(http(503));
    expect(d).toEqual({ errorName: "Error", errorCode: "503" });
    expect(JSON.stringify(d)).not.toContain("secret");
  });
  it("copes with odd values", () => {
    expect(describeError(null)).toEqual({ errorName: "Error", errorCode: "none" });
    expect(describeError("text")).toEqual({ errorName: "Error", errorCode: "none" });
  });
});
