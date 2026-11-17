# Decisions log

## 2026-11-16: Vertex AI image models (verified from Google Cloud docs)
Source: docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/{3-1-flash-image,3-pro-image}

| Model | Vertex model ID | Endpoint | Ref images | Resolutions | Output tokens/image |
| --- | --- | --- | --- | --- | --- |
| Nano Banana 2 family (Gemini 3.1 Flash Image) | `gemini-3.1-flash-image` | global (also `us`/`eu` multi-region) | 14 | 512, 1K, 2K, 4K | 1K ~1,120; 2K ~1,680; 4K ~2,520 |
| Nano Banana Pro (Gemini 3 Pro Image) | `gemini-3-pro-image` | global only | 14 (10 if passed by HTTP URL; use inline/gs://) | 1K, 2K, 4K | 1K/2K 1,120; 4K 2,000; input image 560 tokens |

- Aspect ratio 4:3 supported by both.
- Spec says "Nano Banana 2"; docs also list "Nano Banana 2.1" and "Nano Banana 2 Lite" (3.1 Flash-Lite Image). Confirm exact choice in Model Garden.
- **Prices: NOT yet verified.** The pricing page did not load via automated fetch. Owner to read the current per-token rates from cloud.google.com/vertex-ai/generative-ai/pricing and put them in `config/models`. Cost code reads prices from config, never hard-coded.
- Data residency: these models list ML processing only in `us`/`eu`, not India. Photos will leave `asia-south1` for AI calls. Flag for lawyer/DPDP review.

## Pending
- Google written approval for minors' photos on Vertex AI image models: NOT yet obtained.

## 2026-11-16: Live smoke test (text-only, no child data)
- `gemini-3.1-flash-image` and `gemini-3-pro-image` both return images from project `book-dev-env` via the `global` endpoint with ADC.
- 1K output, 1,120 output tokens each. Latency about 9 s (flash) and 16 s (pro).
- Judge model: `gemini-2.5-flash` returns 404 on this project. Working IDs: `gemini-3-flash-preview`, `gemini-3.1-flash-lite`. Using `gemini-3-flash-preview` (preview model: re-check before launch).

## 2026-11-16: Milestone 1 spike, set01 (1 child, girl, age 1; photos 3)
Models run on identical photos. Ratings are the owner's 1-5 "looks like this child" (single rater).

| Run | Model | Prompted age | Avg rating | Lowest | Avg face score |
| --- | --- | --- | --- | --- | --- |
| spike-output | Flash (`gemini-3.1-flash-image`) | 5 (wrong: default) | not rated | | 0.15 |
| spike-output-pro | Pro (`gemini-3-pro-image`) | 5 (wrong: default) | 3.00 | 2 | 0.32 |
| spike-v2-pro | Pro | 1 | 2.85 | 1 | 0.37 |
| spike-v2-flash | Flash | 1 | not rated | | 0.44 |

- **Baseline chosen by owner: `spike-v2-pro`.** Best image per page copied to `spike-baseline/` (hero 3.5, doctor/pilot/astronaut/chef 3.0).
- **Gate NOT met.** Spec target is average >= 4.0 and no set below 3.0. All rated runs average about 3.
- **Lesson:** the runner defaulted to age 5 when `child.json` was missing; the wrong age hurt Flash badly (face score 0.15 vs 0.44 once corrected).
- **Lesson:** face score is a weak proxy. A 0.12 image rated 1, but images from 0.25 to 0.43 all rated about 3. Thresholds must be calibrated against human ratings on a larger set.
- **Caveat:** a 1-year-old is outside the product's 3-7 range and is the hardest case for face matching. Re-test with children aged 4-6.
- Next experiments: semi-realistic style (`--style semireal`), more/better reference photos, age 2-3 in prompt, more candidates per page.
- Cost: Pro and Flash token counts are in each run's `results.json`; prices still unverified.

## 2026-11-16: Cover (spike, set01)
- Model for all covers: `gemini-3-pro-image` (Pro), 2K, 4:3, global endpoint.
- Round 1 (photos only, child looking up): watercolour face scores 0.08-0.25: poor likeness, rejected by owner.
- Round 2 (cover template changed to face the viewer; hero portrait added as extra reference): watercolour 0.33-0.40, photorealistic 0.60-0.70.
- **Owner shortlist (4):** watercolour `82d13338` (0.40) and `dc64238b` (0.39); photorealistic `ab1ded7a` (0.70) and `e8d3d0f0` (0.65). All others rejected.
- Lessons: always pass the approved hero portrait as a reference for non-portrait pages; avoid side-looking poses for cover; judge prompt must check the requested style (it marks photorealistic output down on "style_matches" because it expects watercolour). Fix judge prompt in Milestone 4.
- Cover title is text laid over the art by the render service, using the name the user entered (`When {name} Grows Up`); never put the name in prompts or logs.

## 2026-11-16: Spend so far (estimate, to verify in Cloud Billing > Reports for `book-dev-env`)
- Saved images: Pro 54 (2K, 1,120 output tokens each), Flash 20 (2K, 1,680 output tokens each).
- Prices used (from web search, NOT yet confirmed on Google's pricing page): Pro 2K about $0.134/image; Flash 2K about $0.101/image; Pro input about $2/M tokens.
- Estimate: Pro about $7.26 + Flash about $2.02 + input about $0.3 + unsaved/test images about $0.7 = about US$10-11 (about zl40). Judge calls (Gemini 3 Flash preview) a few cents.
- Rough cost per finished book (15 illustrated pages x 3 candidates, no regenerations): Pro about $6, Flash about $4.5.
- TODO: confirm prices on https://cloud.google.com/vertex-ai/generative-ai/pricing and put them in `config/models` (`usdPerMillionInputTokens`, `usdPerMillionOutputTokens`) so `costUsd` is computed automatically.

## 2026-11-16: Firebase / GCP dev setup done by agent (book-dev-env, project number 420016114828)
- Firestore Native `asia-south1`; default Storage bucket `book-dev-env.firebasestorage.app` `asia-south1`; email-link + Google sign-in; web app `storybook-web-dev`; `localhost` authorised; rules deployed (57 emulator tests pass).
- Budgets `storybook-dev-100pln/250pln/500pln` (PLN) + Pub/Sub `billing-alerts`. Billing account also holds unrelated budgets for other projects: do not modify.
- Terraform v1.9.8 installed per-user at `C:\Users\ShaniKumar-Admin\tools\terraform\terraform.exe` (checksum verified against HashiCorp SHA256SUMS).
- TODO LATER (owner decision): App Check + reCAPTCHA v3. Do not enforce App Check until the web app sends tokens.
- Firebase console showed zl1,133 credit remaining with about zl40 of spike spend not yet reflected (billing lags a few hours); recheck.
- Service account names differ from the spec (GCP rules): sa-face-score, sa-cicd.

## 2026-11-16: Web hosting (Firebase App Hosting)
- Backend `storybook-studio`, region `asia-southeast1` (Singapore; App Hosting offers fewer regions than Firestore, Mumbai was not used). Child data never passes through this server; the browser talks to Firestore/Storage in `asia-south1` directly.
- Runtime `nodejs22` with automatic base image updates. Repo CI and the dev machine still use Node 20 (end of life): move CI to Node 22.
- Deploy model: every push to `main` is built by Cloud Build (buildpacks) and rolled out to Cloud Run. Not managed by Terraform.
- apps/web is self-contained: own `package-lock.json` (App Hosting needs a lock file inside the app folder; the monorepo's pnpm lock file is at the root), own `tsconfig.json`, and `next.config.mjs` picks the project root (app folder on App Hosting, repo root with pnpm locally). Keep the web app free of `workspace:` dependencies, or the standalone build breaks. After changing web dependencies, regenerate `apps/web/package-lock.json` from a clean folder (`npm install --package-lock-only`), not inside the pnpm tree (it would record local paths).
- Failures hit and fixed: (1) missing lock file in app folder; (2) Next.js root set to repo root nested the standalone output and the adapter could not find routes-manifest.json.
- Runtime service account is Firebase's default; switch to the dedicated `sa-web` later.

## 2026-11-16: Milestone 3 (Intake) decisions and findings

### Licence risk: InsightFace pre-trained models (MUST RESOLVE BEFORE LAUNCH)
- The spec chooses InsightFace/ArcFace for face scoring. The InsightFace library code is MIT, but its pre-trained model packs (`buffalo_l`, used here) are published for non-commercial research use only. A paid product needs a commercial licence from the InsightFace authors, or a different face-embedding model with a commercial-friendly licence, or a managed service. Owner to decide; verify the current licence text at github.com/deepinsight/insightface first. Fine for dev and the spike.

### Photo check timing (spec target: under 5 s per photo)
- face-score on Cloud Run (2 vCPU, 2 GiB, CPU only): cold start about 13 s, warm about 2.3 s per `/embed` call. The full real check (Vision + cleanup + face-score) took 5 to 7 s per photo in a local run while warm, including slow token fetching in the dev script.
- Options if the deployed function misses 5 s: `min-instances=1` for face-score (small continuous cost), a warm-up call when the parent opens the photos page, or a smaller detection size. Measure on the deployed function first.

### Design
- Photos upload from the browser to the private `<project>-uploads` bucket (linked to Firebase so the same Storage rules apply). The Storage-triggered function normalises (HEIC to JPEG, orientation, strip EXIF/GPS, max 2048 px), runs the Cloud Vision face rules, calls face-score for a 512-d embedding, stores only `photoN.jpg` and `photoN.embedding.json`, and deletes the raw upload. Book status moves photos_checking to photos_ready or photos_failed, with an audit entry per change.
- Same-child check: every pair of embeddings must reach cosine 0.45; the odd photo out is flagged `DIFFERENT_CHILD`.
- Cloud Vision has no sunglasses detector, only `headwearLikelihood`. Sunglasses are not detected; could be added to the Gemini judge later.
- Embeddings sit in the uploads bucket with Google default encryption. Spec rule 7 (Cloud KMS for embeddings and shipping addresses) is scheduled for milestone 6.
- Consent: callable `submitConsent` records version, time and an HMAC-SHA256 hash of the IP (key in Secret Manager `IP_HASH_PEPPER`). The consent text is a DRAFT for the owner's lawyer.
- Function defaults for dev (bucket, face-score URL, service account) are in code, because writing environment files is blocked by a Claude Code permission rule. Another environment overrides them with a per-project environment file in `functions/`.
- Web: Tailwind added (spec). apps/web has an `.npmrc` with `legacy-peer-deps=true` because npm crashes resolving the dependency tree without it. Shared rules are copied into `apps/web/lib/generated` by `scripts/sync-web-shared.mjs` (CI checks they are in sync), because the web app cannot import the monorepo packages.

### Milestone 3 deployment status (dev, 2026-11-17)
- Deployed: Cloud Functions `onPhotoUploaded` (Storage trigger on `book-dev-env-uploads`) and `submitConsent`, both as `sa-functions`; face-score on Cloud Run (4 GiB, 2 vCPU, 1 request per instance, max 3 instances).
- Secret `IP_HASH_PEPPER` created by the owner. IAM granted through Terraform (`infra/terraform/functions.tf`), all narrow: eventarc.eventReceiver and serviceusage consumer for sa-functions (project); run.invoker for sa-functions on `face-score` and on `onphotouploaded` (service level); secretAccessor on the pepper; storage.legacyBucketReader on the uploads bucket for sa-functions and the Eventarc service agent (lets the trigger look up the bucket). The broad project-wide `run.invoker`/`eventReceiver` for the default compute account that the deploy tool suggests was NOT granted and was not needed.
- Real end-to-end test in dev (`functions/dev/e2e-dev.mts`, creates and deletes its own test books, uploads straight to the private bucket as the browser would): 11 of 11 checks passed. Three good photos reach `photos_ready`; raw uploads deleted, only cleaned JPEG and embedding kept; EXIF/GPS stripped; 512-number embedding; audit entries by the system; a no-face photo fails with `NO_FACE` and leaves no file; `submitConsent` returns 401 for a caller who is not signed in and writes nothing.
- Timing (spec target under 5 s per photo): 3 photos in parallel took 8.3 s warm and 21.7 s with everything cold. A rejected photo takes about 2.4 s. TARGET NOT MET for good photos. Levers: send face-score a smaller image (1024 px is plenty for the embedding), `min-instances=1` for face-score and the function, and measure where the time goes (Vision, face-score, image cleanup).
- Bugs found only by the dev test, now fixed: missing `@google-cloud/storage` dependency (function would have crashed on its first file); face-score ran out of memory with 3 photos at once and returned 503 (more memory, one request per instance, retry on temporary errors in the function); handler now logs the failing step and error type (never messages or photo data).
- NOT verified: the browser pages (built and type-checked, never exercised in a browser; sign-in needs a real inbox or Google account); the Storage security rules against the real bucket from a signed-in browser (covered by 59 emulator tests only); the successful consent path in dev (needs a signed-in user; covered by unit tests; only the signed-out rejection was checked in dev).
- Function container images older than 1 day are deleted automatically (clean-up policy set by `--force` on deploy).
