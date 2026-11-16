import { describe, expect, it } from "vitest";
import { BOOK_STATUSES, allowedNext, assertTransition, auditForTransition, canTransition, InvalidTransitionError } from "../src/status.js";
import type { BookStatus } from "../src/status.js";

const HAPPY: BookStatus[] = ["draft", "photos_checking", "photos_ready", "preview_generating", "preview_ready", "paid", "book_generating",
  "in_review", "approved", "print_ready", "sent_to_printer", "shipped", "delivered", "purged"];

describe("status machine", () => {
  it("allows the whole happy path in order", () => {
    for (let i = 0; i < HAPPY.length - 1; i++) expect(canTransition(HAPPY[i]!, HAPPY[i + 1]!)).toBe(true);
  });
  it("forbids skipping steps", () => {
    expect(canTransition("draft", "paid")).toBe(false);
    expect(canTransition("preview_ready", "approved")).toBe(false);
    expect(canTransition("paid", "shipped")).toBe(false);
  });
  it("forbids going backwards on the main path", () => {
    expect(canTransition("shipped", "approved")).toBe(false);
    expect(canTransition("paid", "preview_ready")).toBe(false);
  });
  it("purged is terminal", () => {
    expect(allowedNext("purged")).toEqual([]);
  });
  it("every status is reachable from draft", () => {
    const seen = new Set<BookStatus>(["draft"]);
    const queue: BookStatus[] = ["draft"];
    while (queue.length) {
      for (const n of allowedNext(queue.shift()!)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    expect([...seen].sort()).toEqual([...BOOK_STATUSES].sort());
  });
  it("every transition target is a known status", () => {
    for (const s of BOOK_STATUSES) for (const n of allowedNext(s)) expect(BOOK_STATUSES).toContain(n);
  });
  it("supports photo retry and one preview regeneration", () => {
    expect(canTransition("photos_failed", "photos_checking")).toBe(true);
    expect(canTransition("preview_ready", "preview_generating")).toBe(true);
    expect(canTransition("preview_failed", "preview_generating")).toBe(true);
  });
  it("blocks refunds after the order is with the printer", () => {
    expect(canTransition("print_ready", "refunded")).toBe(true);
    expect(canTransition("sent_to_printer", "refunded")).toBe(false);
    expect(canTransition("shipped", "refunded")).toBe(false);
  });
  it("sends a blocked generation back to work after admin action", () => {
    expect(canTransition("generation_blocked", "book_generating")).toBe(true);
  });
  it("assertTransition throws a typed error", () => {
    expect(() => assertTransition("draft", "shipped")).toThrow(InvalidTransitionError);
  });
  it("audit entries hold ids only and reject invalid moves", () => {
    const a = auditForTransition("system", "book123", "paid", "book_generating", 1);
    expect(a).toEqual({ actor: "system", action: "status:paid->book_generating", bookId: "book123", at: 1 });
    expect(() => auditForTransition("system", "b", "draft", "delivered")).toThrow();
  });
});
