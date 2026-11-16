import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

let env: RulesTestEnvironment;
const OWNER = "owner-uid";
const OTHER = "other-uid";
const BOOK = "book1";
const jpeg = { contentType: "image/jpeg" };
const small = new Uint8Array([1, 2, 3, 4]);

beforeAll(async () => {
  const rules = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
  env = await initializeTestEnvironment({
    projectId: "demo-gycb",
    firestore: { rules: rules("firestore.rules"), host: "127.0.0.1", port: 8080 },
    storage: { rules: rules("storage.rules"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "books", BOOK), { ownerUid: OWNER, status: "draft" });
    await uploadBytes(ref(ctx.storage(), `books/${BOOK}/photos/photo1`), small, jpeg);
  });
});

const ownerStorage = () => env.authenticatedContext(OWNER).storage();
const otherStorage = () => env.authenticatedContext(OTHER).storage();
const anonStorage = () => env.unauthenticatedContext().storage();
const adminStorage = () => env.authenticatedContext("admin-uid", { admin: true }).storage();
const photo = (s: ReturnType<typeof ownerStorage>, slot: string) => ref(s, `books/${BOOK}/photos/${slot}`);

describe("uploads: create", () => {
  it("owner can upload into a fixed slot", async () => {
    for (const slot of ["photo1", "photo2", "photo3"]) {
      await assertSucceeds(uploadBytes(photo(ownerStorage(), slot), small, jpeg));
    }
  });
  it("accepts png and heic", async () => {
    await assertSucceeds(uploadBytes(photo(ownerStorage(), "photo2"), small, { contentType: "image/png" }));
    await assertSucceeds(uploadBytes(photo(ownerStorage(), "photo3"), small, { contentType: "image/heic" }));
  });
  it("a 4th photo slot is rejected (max 3 per book)", async () => {
    await assertFails(uploadBytes(photo(ownerStorage(), "photo4"), small, jpeg));
    await assertFails(uploadBytes(photo(ownerStorage(), "extra"), small, jpeg));
  });
  it("non-image content types are rejected", async () => {
    await assertFails(uploadBytes(photo(ownerStorage(), "photo2"), small, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(photo(ownerStorage(), "photo2"), small, { contentType: "text/html" }));
    await assertFails(uploadBytes(photo(ownerStorage(), "photo2"), small, { contentType: "image/svg+xml" }));
  });
  it("files of 15 MB or more are rejected, just under is accepted", async () => {
    await assertFails(uploadBytes(photo(ownerStorage(), "photo2"), new Uint8Array(15 * 1024 * 1024), jpeg));
    await assertSucceeds(uploadBytes(photo(ownerStorage(), "photo2"), new Uint8Array(15 * 1024 * 1024 - 1), jpeg));
  });
  it("other user and signed-out cannot upload", async () => {
    await assertFails(uploadBytes(photo(otherStorage(), "photo2"), small, jpeg));
    await assertFails(uploadBytes(photo(anonStorage(), "photo2"), small, jpeg));
  });
  it("admin cannot upload on behalf of a parent", async () =>
    assertFails(uploadBytes(photo(adminStorage(), "photo2"), small, jpeg)));
  it("owner can replace a photo (update) and delete it while editable", async () => {
    await assertSucceeds(uploadBytes(photo(ownerStorage(), "photo1"), small, jpeg));
    await assertSucceeds(deleteObject(photo(ownerStorage(), "photo1")));
  });
});

describe("uploads: book status gating", () => {
  const setStatus = (status: string) =>
    env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), "books", BOOK), { status }));

  it.each(["draft", "photos_checking", "photos_failed", "photos_ready"])("allowed while %s", async (s) => {
    await setStatus(s);
    await assertSucceeds(uploadBytes(photo(ownerStorage(), "photo2"), small, jpeg));
  });
  it.each(["preview_generating", "preview_ready", "paid", "book_generating", "delivered", "purged"])(
    "blocked once %s",
    async (s) => {
      await setStatus(s);
      await assertFails(uploadBytes(photo(ownerStorage(), "photo2"), small, jpeg));
      await assertFails(deleteObject(photo(ownerStorage(), "photo1")));
    },
  );
  it("a book that does not exist cannot receive uploads", async () => {
    await assertFails(uploadBytes(ref(ownerStorage(), "books/ghost/photos/photo1"), small, jpeg));
  });
});

describe("reads and other paths", () => {
  it("nobody can read photos from the client, not even the owner or admin", async () => {
    await assertFails(getBytes(photo(ownerStorage(), "photo1")));
    await assertFails(getBytes(photo(adminStorage(), "photo1")));
    await assertFails(getBytes(photo(otherStorage(), "photo1")));
    await assertFails(getBytes(photo(anonStorage(), "photo1")));
  });
  it("no client access to any other path", async () => {
    for (const path of [
      `books/${BOOK}/hero/hero.png`,
      `books/${BOOK}/pages/1/c1.png`,
      `books/${BOOK}/print.pdf`,
      `books/${BOOK}/preview/1.webp`,
      "random/file.txt",
    ]) {
      await assertFails(uploadBytes(ref(ownerStorage(), path), small, jpeg));
      await assertFails(getBytes(ref(ownerStorage(), path)));
      await assertFails(uploadBytes(ref(adminStorage(), path), small, jpeg));
    }
  });
});
