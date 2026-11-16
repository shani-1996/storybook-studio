import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { ConsentError, recordConsent } from "./consent/handler.js";
import { faceScoreEmbedder, FirestoreBooks, gcsBlobs, visionFaces } from "./adapters/google.js";
import { checkPhoto, parseRawPhotoPath, type Logger } from "./photoCheck/handler.js";
import { sharpNormaliser } from "./photoCheck/image.js";

initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });

// Dev defaults (not secrets). Another environment overrides them with functions/.env.<projectId>.
const UPLOADS_BUCKET = defineString("UPLOADS_BUCKET", { default: "book-dev-env-uploads" });
const FACE_SCORE_URL = defineString("FACE_SCORE_URL", { default: "https://face-score-420016114828.asia-south1.run.app" });
const SERVICE_ACCOUNT = defineString("FUNCTIONS_SERVICE_ACCOUNT", { default: "sa-functions@book-dev-env.iam.gserviceaccount.com" });
const IP_HASH_PEPPER = defineSecret("IP_HASH_PEPPER");

setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

/** Logs carry IDs and reason codes only. */
const log: Logger = {
  info: (message, fields) => logger.info(message, fields),
  warn: (message, fields) => logger.warn(message, fields),
};

/** A parent uploaded a photo: check it, and move the book to photos_ready or photos_failed. */
export const onPhotoUploaded = onObjectFinalized(
  {
    bucket: UPLOADS_BUCKET,
    serviceAccount: SERVICE_ACCOUNT,
    memory: "1GiB",
    timeoutSeconds: 180,
    retry: false, // a failed check is shown to the parent, who re-uploads; no automatic retry loop
  },
  async (event) => {
    const parsed = parseRawPhotoPath(event.data.name);
    if (!parsed) return; // our own cleaned output or an unrelated file
    const books = new FirestoreBooks();
    await checkPhoto(
      {
        books,
        blobs: gcsBlobs(event.data.bucket),
        images: sharpNormaliser,
        vision: visionFaces(),
        embedder: faceScoreEmbedder(FACE_SCORE_URL.value()),
        log,
        now: () => Date.now(),
      },
      parsed.bookId,
      parsed.photoId,
    );
  },
);

/** The parent ticks the consent box. Recorded server-side with a hashed IP. */
export const submitConsent = onCall(
  { serviceAccount: SERVICE_ACCOUNT, secrets: [IP_HASH_PEPPER] },
  async (request) => {
    const forwarded = request.rawRequest.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim() ?? request.rawRequest.ip ?? "";
    try {
      return await recordConsent(
        { store: new FirestoreBooks(), pepper: IP_HASH_PEPPER.value(), now: () => Date.now() },
        request.auth?.uid,
        request.data,
        ip,
      );
    } catch (e) {
      if (e instanceof ConsentError) throw new HttpsError(e.code, e.message);
      logger.error("consent failed unexpectedly");
      throw new HttpsError("internal", "Something went wrong. Please try again.");
    }
  },
);
