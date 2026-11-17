import { describe, expect, it } from "vitest";
import { startPreview, type AccessConfig } from "../src/preview/start.js";

function make(access: AccessConfig) {
  const queued: string[] = [];
  const blocked: string[] = [];
  return {
    queued,
    blocked,
    deps: {
      getAccess: async () => access,
      enqueue: async (id: string) => void queued.push(id),
      markBlocked: async (id: string) => void blocked.push(id),
    },
  };
}

describe("starting a preview after consent", () => {
  it("queues the job for a listed tester, ignoring case and spaces", async () => {
    const t = make({ open: false, testerEmails: ["Friend@Example.com "] });
    expect(await startPreview(t.deps, "b1", "friend@example.com")).toBe("queued");
    expect(t.queued).toEqual(["b1"]);
  });

  it("does not queue (and says why) for someone who is not listed", async () => {
    const t = make({ open: false, testerEmails: ["friend@example.com"] });
    expect(await startPreview(t.deps, "b1", "stranger@example.com")).toBe("not_invited");
    expect(t.queued).toEqual([]);
    expect(t.blocked).toEqual(["b1"]);
  });

  it("does not queue when the account has no email address", async () => {
    const t = make({ open: false, testerEmails: ["friend@example.com"] });
    expect(await startPreview(t.deps, "b1", undefined)).toBe("not_invited");
  });

  it("queues for anyone once access is open", async () => {
    const t = make({ open: true, testerEmails: [] });
    expect(await startPreview(t.deps, "b1", undefined)).toBe("queued");
  });
});
