import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, type BookStatus } from "@gycb/shared";
import { ConsentError, hashIp, recordConsent, type ConsentBook, type ConsentStore } from "../src/consent/handler.js";

class Store implements ConsentStore {
  books = new Map<string, ConsentBook>();
  writes: { bookId: string; consent: { version: string; acceptedAt: number; ipHash: string }; actor: string }[] = [];
  async getBook(id: string) {
    return this.books.get(id) ?? null;
  }
  async recordConsent(bookId: string, consent: { version: string; acceptedAt: number; ipHash: string }, actor: string) {
    this.writes.push({ bookId, consent, actor });
    this.books.get(bookId)!.consent = consent;
  }
}

const setup = (status: BookStatus = "photos_ready", ownerUid = "owner") => {
  const store = new Store();
  store.books.set("b1", { ownerUid, status });
  return { store, deps: { store, pepper: "test-pepper", now: () => 123 } };
};
const input = { bookId: "b1", version: CONSENT_VERSION };
const fails = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(ConsentError);
  expect((e as ConsentError).code).toBe(code);
};

describe("recordConsent", () => {
  it("records consent for the owner once photos are ready", async () => {
    const { store, deps } = setup();
    expect(await recordConsent(deps, "owner", input, "203.0.113.9")).toEqual({ ok: true });
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]).toMatchObject({ bookId: "b1", actor: "owner", consent: { version: CONSENT_VERSION, acceptedAt: 123 } });
  });

  it("never stores the raw IP, only a 64-character hash", async () => {
    const { store, deps } = setup();
    await recordConsent(deps, "owner", input, "203.0.113.9");
    const stored = JSON.stringify(store.writes);
    expect(stored).not.toContain("203.0.113.9");
    expect(store.writes[0]!.consent.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is idempotent: a second submit does not write again", async () => {
    const { store, deps } = setup();
    await recordConsent(deps, "owner", input, "1.2.3.4");
    await recordConsent(deps, "owner", input, "1.2.3.4");
    expect(store.writes).toHaveLength(1);
  });

  it("requires sign-in", async () => fails(recordConsent(setup().deps, undefined, input, "1.1.1.1"), "unauthenticated"));

  it("gives the same answer for someone else's book and a missing book", async () => {
    const { deps } = setup();
    await fails(recordConsent(deps, "intruder", input, "1.1.1.1"), "permission-denied");
    await fails(recordConsent(deps, "owner", { ...input, bookId: "nope" }, "1.1.1.1"), "permission-denied");
  });

  it("rejects an outdated consent text version", async () =>
    fails(recordConsent(setup().deps, "owner", { ...input, version: "old" }, "1.1.1.1"), "failed-precondition"));

  it.each(["draft", "photos_checking", "photos_failed", "preview_generating", "paid"] as const)(
    "refuses while the book is %s",
    async (status) => {
      const { store, deps } = setup(status);
      await fails(recordConsent(deps, "owner", input, "1.1.1.1"), "failed-precondition");
      expect(store.writes).toHaveLength(0);
    },
  );

  it.each([null, undefined, {}, { bookId: "" }, { bookId: "b1" }, { bookId: 5, version: CONSENT_VERSION }, "text"])(
    "rejects malformed input %j",
    async (bad) => fails(recordConsent(setup().deps, "owner", bad, "1.1.1.1"), "invalid-argument"),
  );
});

describe("hashIp", () => {
  it("is stable for the same input and pepper, and differs by IP or pepper", () => {
    expect(hashIp("1.2.3.4", "p")).toBe(hashIp("1.2.3.4", "p"));
    expect(hashIp("1.2.3.4", "p")).not.toBe(hashIp("1.2.3.5", "p"));
    expect(hashIp("1.2.3.4", "p")).not.toBe(hashIp("1.2.3.4", "q"));
  });
});
