import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs } from "firebase/firestore";

let env: RulesTestEnvironment;

const OWNER = "owner-uid";
const OTHER = "other-uid";
const BOOK = "book1";

const PROFESSIONS = ["doctor", "pilot", "astronaut", "scientist", "artist", "chef", "footballer", "cricketer"];
const validDraft = () => ({
  ownerUid: OWNER,
  storyId: "when-i-grow-up",
  child: { firstName: "Zoe", gender: "girl", age: 5 },
  relationship: "parent",
  status: "draft",
  professions: [...PROFESSIONS],
  dedicationText: "Love you",
  createdAt: serverTimestamp(),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-gycb",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env.cleanup());

async function seed(fn: (db: any) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, "books", BOOK), {
      ownerUid: OWNER, storyId: "when-i-grow-up", status: "draft", professions: PROFESSIONS, dedicationText: "hi",
      child: { firstName: "Zoe", gender: "girl", age: 5 }, relationship: "parent",
    });
    await setDoc(doc(db, "books", BOOK, "photos", "photo1"), { checkStatus: "pass" });
    await setDoc(doc(db, "books", BOOK, "pages", "1"), { visibleToOwner: false, candidates: [] });
    await setDoc(doc(db, "books", BOOK, "pages", "2"), { visibleToOwner: true });
    await setDoc(doc(db, "orders", "o1"), { ownerUid: OWNER, bookId: BOOK });
    await setDoc(doc(db, "config", "pricing"), { hardcoverInr: 2499 });
    await setDoc(doc(db, "config", "limits"), { previewsPerUser: 1 });
    await setDoc(doc(db, "templates", "doctor"), { id: "doctor" });
    await setDoc(doc(db, "audit", "a1"), { actor: "system" });
    await setDoc(doc(db, "mail", "m1"), { to: "x" });
    await setDoc(doc(db, "users", OWNER), { email: "x" });
  });
});

const owner = () => env.authenticatedContext(OWNER).firestore();
const other = () => env.authenticatedContext(OTHER).firestore();
const admin = () => env.authenticatedContext("admin-uid", { admin: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("books: read", () => {
  it("signed-out cannot read", async () => assertFails(getDoc(doc(anon(), "books", BOOK))));
  it("owner can read", async () => assertSucceeds(getDoc(doc(owner(), "books", BOOK))));
  it("other user cannot read", async () => assertFails(getDoc(doc(other(), "books", BOOK))));
  it("admin can read", async () => assertSucceeds(getDoc(doc(admin(), "books", BOOK))));
  it("a non-admin claim does not grant access", async () => {
    const db = env.authenticatedContext(OTHER, { admin: false }).firestore();
    await assertFails(getDoc(doc(db, "books", BOOK)));
  });
  it("cannot list all books", async () => assertFails(getDocs(collection(other(), "books"))));
});

describe("books: create", () => {
  it("owner can create a valid draft", async () => assertSucceeds(setDoc(doc(owner(), "books", "new1"), validDraft())));
  it("signed-out cannot create", async () => assertFails(setDoc(doc(anon(), "books", "new1"), validDraft())));
  it("cannot create for another owner", async () =>
    assertFails(setDoc(doc(other(), "books", "new1"), validDraft())));
  it("cannot create with a status other than draft", async () =>
    assertFails(setDoc(doc(owner(), "books", "new1"), { ...validDraft(), status: "paid" })));
  it("cannot add server-managed fields", async () => {
    await assertFails(setDoc(doc(owner(), "books", "n1"), { ...validDraft(), costEstimateUsd: 0 }));
    await assertFails(setDoc(doc(owner(), "books", "n2"), { ...validDraft(), consent: { version: "1" } }));
    await assertFails(setDoc(doc(owner(), "books", "n3"), { ...validDraft(), deleteAfter: 1 }));
  });
  it("cannot omit required fields", async () => {
    const { dedicationText, ...rest } = validDraft();
    void dedicationText;
    await assertFails(setDoc(doc(owner(), "books", "n1"), rest));
  });
  it("rejects a fake createdAt", async () =>
    assertFails(setDoc(doc(owner(), "books", "n1"), { ...validDraft(), createdAt: new Date(2000, 1, 1) })));
  it("rejects bad child data", async () => {
    const bad = (child: unknown) => setDoc(doc(owner(), "books", "nx"), { ...validDraft(), child });
    await assertFails(bad({ firstName: "Zoe", gender: "girl", age: 2 }));
    await assertFails(bad({ firstName: "Zoe", gender: "girl", age: 8 }));
    await assertFails(bad({ firstName: "", gender: "girl", age: 5 }));
    await assertFails(bad({ firstName: "A".repeat(21), gender: "girl", age: 5 }));
    await assertFails(bad({ firstName: "Zoe", gender: "x", age: 5 }));
    await assertFails(bad({ firstName: "Zoe", gender: "girl", age: 5, school: "s" }));
    await assertFails(bad({ firstName: "Zoe", gender: "girl", age: 5.5 }));
  });
  it("rejects wrong profession count and long dedication", async () => {
    await assertFails(setDoc(doc(owner(), "books", "n1"), { ...validDraft(), professions: PROFESSIONS.slice(0, 7) }));
    await assertFails(setDoc(doc(owner(), "books", "n2"), { ...validDraft(), dedicationText: "x".repeat(401) }));
  });
  it("rejects an unknown relationship", async () =>
    assertFails(setDoc(doc(owner(), "books", "n1"), { ...validDraft(), relationship: "stranger" })));
  it("requires a well-formed storyId", async () => {
    const { storyId, ...rest } = validDraft();
    void storyId;
    await assertFails(setDoc(doc(owner(), "books", "s0"), rest));
    await assertSucceeds(setDoc(doc(owner(), "books", "s1"), { ...validDraft(), storyId: "animal-friends" }));
    await assertFails(setDoc(doc(owner(), "books", "s2"), { ...validDraft(), storyId: "Bad Story!" }));
    await assertFails(setDoc(doc(owner(), "books", "s3"), { ...validDraft(), storyId: "" }));
    await assertFails(setDoc(doc(owner(), "books", "s4"), { ...validDraft(), storyId: "x".repeat(41) }));
    await assertFails(setDoc(doc(owner(), "books", "s5"), { ...validDraft(), storyId: 5 }));
  });
  it("storyId cannot be changed after creation", async () =>
    assertFails(updateDoc(doc(owner(), "books", BOOK), { storyId: "other-story" })));
});

describe("books: update and delete", () => {
  it("owner can edit dedication and professions while editable", async () => {
    await assertSucceeds(updateDoc(doc(owner(), "books", BOOK), { dedicationText: "new text" }));
    await assertSucceeds(updateDoc(doc(owner(), "books", BOOK), { professions: [...PROFESSIONS].reverse() }));
  });
  it("owner cannot change status, owner, child or server fields", async () => {
    const ref = () => doc(owner(), "books", BOOK);
    await assertFails(updateDoc(ref(), { status: "paid" }));
    await assertFails(updateDoc(ref(), { ownerUid: OTHER }));
    await assertFails(updateDoc(ref(), { child: { firstName: "Eve", gender: "girl", age: 5 } }));
    await assertFails(updateDoc(ref(), { previewRegenUsed: false }));
    await assertFails(updateDoc(ref(), { heroSheetPath: "x" }));
  });
  it("owner cannot edit after payment", async () => {
    await seed(async (db) => updateDoc(doc(db, "books", BOOK), { status: "paid" }));
    await assertFails(updateDoc(doc(owner(), "books", BOOK), { dedicationText: "late" }));
  });
  it("other user and signed-out cannot update", async () => {
    await assertFails(updateDoc(doc(other(), "books", BOOK), { dedicationText: "x" }));
    await assertFails(updateDoc(doc(anon(), "books", BOOK), { dedicationText: "x" }));
  });
  it("admin cannot write from the client either", async () =>
    assertFails(updateDoc(doc(admin(), "books", BOOK), { status: "approved" })));
  it("nobody can delete", async () => {
    await assertFails(deleteDoc(doc(owner(), "books", BOOK)));
    await assertFails(deleteDoc(doc(admin(), "books", BOOK)));
  });
});

describe("book subcollections", () => {
  it("photos: owner and admin read, others cannot", async () => {
    await assertSucceeds(getDoc(doc(owner(), "books", BOOK, "photos", "photo1")));
    await assertSucceeds(getDoc(doc(admin(), "books", BOOK, "photos", "photo1")));
    await assertFails(getDoc(doc(other(), "books", BOOK, "photos", "photo1")));
    await assertFails(getDoc(doc(anon(), "books", BOOK, "photos", "photo1")));
  });
  it("photos: nobody writes from the client", async () => {
    await assertFails(setDoc(doc(owner(), "books", BOOK, "photos", "photo2"), { checkStatus: "pass" }));
    await assertFails(updateDoc(doc(owner(), "books", BOOK, "photos", "photo1"), { checkStatus: "fail" }));
  });
  it("pages: owner sees only pages marked visible", async () => {
    await assertFails(getDoc(doc(owner(), "books", BOOK, "pages", "1")));
    await assertSucceeds(getDoc(doc(owner(), "books", BOOK, "pages", "2")));
  });
  it("pages: admin reads all, others none, no client writes", async () => {
    await assertSucceeds(getDoc(doc(admin(), "books", BOOK, "pages", "1")));
    await assertFails(getDoc(doc(other(), "books", BOOK, "pages", "2")));
    await assertFails(setDoc(doc(owner(), "books", BOOK, "pages", "3"), { visibleToOwner: true }));
    await assertFails(updateDoc(doc(owner(), "books", BOOK, "pages", "2"), { selectedCandidate: "c" }));
  });
});

describe("orders", () => {
  it("owner and admin read; others cannot", async () => {
    await assertSucceeds(getDoc(doc(owner(), "orders", "o1")));
    await assertSucceeds(getDoc(doc(admin(), "orders", "o1")));
    await assertFails(getDoc(doc(other(), "orders", "o1")));
    await assertFails(getDoc(doc(anon(), "orders", "o1")));
  });
  it("nobody writes from the client", async () => {
    await assertFails(setDoc(doc(owner(), "orders", "o2"), { ownerUid: OWNER, paymentStatus: "paid" }));
    await assertFails(updateDoc(doc(owner(), "orders", "o1"), { paymentStatus: "paid" }));
    await assertFails(setDoc(doc(admin(), "orders", "o3"), { ownerUid: OWNER }));
  });
});

describe("config, templates, audit, mail, users", () => {
  it("pricing is public to read", async () => assertSucceeds(getDoc(doc(anon(), "config", "pricing"))));
  it("other config is admin-read only", async () => {
    await assertFails(getDoc(doc(owner(), "config", "limits")));
    await assertFails(getDoc(doc(anon(), "config", "limits")));
    await assertSucceeds(getDoc(doc(admin(), "config", "limits")));
  });
  it("config cannot be written from the client, even by admin", async () => {
    await assertFails(updateDoc(doc(admin(), "config", "limits"), { previewsPerUser: 99 }));
    await assertFails(updateDoc(doc(owner(), "config", "pricing"), { hardcoverInr: 1 }));
  });
  it("templates: admin read only, no writes", async () => {
    await assertSucceeds(getDoc(doc(admin(), "templates", "doctor")));
    await assertFails(getDoc(doc(owner(), "templates", "doctor")));
    await assertFails(setDoc(doc(admin(), "templates", "x"), { id: "x" }));
  });
  it("audit: admin read only, no writes", async () => {
    await assertSucceeds(getDoc(doc(admin(), "audit", "a1")));
    await assertFails(getDoc(doc(owner(), "audit", "a1")));
    await assertFails(setDoc(doc(admin(), "audit", "a2"), { actor: "x" }));
  });
  it("mail: nobody from the client", async () => {
    await assertFails(getDoc(doc(admin(), "mail", "m1")));
    await assertFails(setDoc(doc(owner(), "mail", "m2"), { to: "x" }));
  });
  it("users: own doc readable, never writable", async () => {
    await assertSucceeds(getDoc(doc(owner(), "users", OWNER)));
    await assertFails(getDoc(doc(other(), "users", OWNER)));
    await assertFails(updateDoc(doc(owner(), "users", OWNER), { previewCount: 0 }));
  });
  it("unknown collections are denied", async () => {
    await assertFails(getDoc(doc(admin(), "secrets", "x")));
    await assertFails(setDoc(doc(owner(), "secrets", "x"), { a: 1 }));
  });
});
