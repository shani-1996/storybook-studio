# Implementation Plan: "When I Grow Up" Storybook App

Derived from `docs/SPEC.md`. Section numbers (§) refer to that spec. The repo is currently empty apart from the spec, so everything starts from zero.

Rules that apply to every step (§1, §10): TypeScript strict; config not hard-coded; never log child data (order/book IDs only); emulator and fixtures only in tests; one PR per milestone with summary, test report, and owner to-do list.

---

## Milestone 0: Kickoff (before any code)

Owner inputs needed:
1. Confirm project IDs (`storybook-dev` / `storybook-prod`) or supply different ones.
2. Complete §4A–4C for dev (billing, budget alerts, Firebase on Blaze, Firestore + Storage in `asia-south1`, APIs enabled).
3. Start the Google written-approval request for minors' photos on Vertex AI (long lead time, blocks launch).
4. Recruit 20–30 consenting families for the likeness test set.

Agent actions:
- Create `docs/decisions.md`, `docs/setup-checklist.md` (copy of §4 as tickable list), `docs/runbook.md` stub.
- `CLAUDE.md` (renamed from `CLAUDE.md.txt`) already holds the project rules and points to `docs/SPEC.md` (renamed from the long spec filename).

---

## Milestone 1: Quality spike (weeks 1–2) — proves likeness before building the app

Needs from owner: dev project ID, ADC login (`gcloud auth application-default login`), test photo sets, style reference images.

Steps:
1. Minimal pnpm workspace: `/services/genkit-flows` (TS, strict), `/services/face-score` (Python).
2. `face-score` service: `/detect`, `/embed`, `/compare` using InsightFace on CPU, with pytest unit tests. Run locally first.
3. Genkit flows in `/services/genkit-flows/spike`: `heroSheet`, `generatePage`, `judge` (Gemini Flash, JSON output validated by Zod).
4. Spike runner script: for each photo set, run hero sheet (3 candidates) plus 4 profession pages, on both Nano Banana 2 and Nano Banana Pro; record face score, judge score, latency, tokens, cost.
5. Re-check current Vertex AI prices and model IDs; record version and date in `docs/decisions.md`.
6. Output a rating sheet (HTML or CSV) for the owner + 2 raters (1–5 likeness).
7. Analyse ratings, tune `faceScoreMin` and `judgeScoreMin` to ≥80% agreement with human picks.

Done when: average rating ≥ 4.0, no set < 3.0, model and thresholds chosen, real cost per page in `docs/decisions.md`. Decision gate: primary image model (§14).

---

## Milestone 2: Foundation (week 3)

Steps:
1. Monorepo skeleton per §3 layout: `apps/web`, `functions`, `services/*`, `workflows`, `packages/shared`, `content`, `infra/terraform`.
2. `packages/shared`: Zod schemas (book, child, order, config), book status state machine with allowed-transition table, config loader. Vitest unit tests.
3. Terraform: 3 buckets with lifecycle rules (§5), 8 service accounts (least privilege), Artifact Registry, Cloud Tasks queue `page-gen`, Pub/Sub `billing-alerts`, Workload Identity Federation, alert policies stub.
4. `firestore.rules`, `storage.rules` plus emulator tests for every collection and bucket (owner / other user / signed-out / admin).
5. `firebase.json`, Emulator Suite config (Auth, Firestore, Storage, Functions, Pub/Sub).
6. GitHub Actions: lint, typecheck, tests, rules tests on PR; deploy to dev on push to `main` via WIF.
7. Placeholder Next.js site (Tailwind) on Firebase App Hosting.
8. Seed scripts for `config/*` defaults.

Owner: apply Terraform first time, run WIF commands, create GitHub repo.

Done when: push to `main` deploys to dev and all rule tests pass.

---

## Milestone 3: Intake (week 4)

Steps:
1. Auth: Firebase email link + Google, App Check (reCAPTCHA v3), return-to-origin redirect.
2. `/create/details` with shared Zod validation, profanity filter, live title preview.
3. Book creation (draft fields only from client), `users/{uid}` Function.
4. `/create/photos`: direct upload to `uploads` bucket (rules: owner, MIME, < 15 MB, max 3), per-photo status chip, mobile camera capture, good/bad examples.
5. Photo check Function (§6 Step 1): HEIC→JPEG, strip EXIF, resize 2048 px, Cloud Vision rules, `face-score /embed`, cross-photo similarity ≥ 0.45, set `photos_ready` or `photos_failed`. Embeddings stored KMS-encrypted.
6. Deploy `face-score` to Cloud Run (CPU, min instances 0, App Check / IAM-protected).
7. `/create/consent` with versioned text, IP hash recorded.
8. `photo-problem` email template.
9. Tests: unit + emulator integration with Vision fixtures; check < 5 s per photo.

Done when: 3 good photos reach `photos_ready`, bad photos show the correct reason, in emulator and dev.

---

## Milestone 4: Preview (weeks 5–6)

Owner decisions needed first: pages per profession, verses and profession list, fonts, SMTP provider, free preview size.

Steps:
1. Content: `/content/templates/*.json` for 16 professions (placeholder verses, flagged for owner approval), sync script to Firestore `templates/*`.
2. Genkit flows productionised on Cloud Run: `heroSheet`, `generatePage`, `judge`, with prompt builder (unit tested), fallback model, safety-block handling, cost tracking per candidate and `costEstimateUsd` rollup.
3. Scoring and selection logic (shared package, unit tested): thresholds, 0.6/0.4 weighting.
4. Render service (Node + Puppeteer): HTML templates, text overlay avoiding face box, long-name and Devanagari handling, watermarking, WebP previews ≤ 1200 px. Playwright visual tests (3/10/20-char names × she/he/they).
5. `workflows/preview.yaml`: limit checks, hero sheet, cover + 1 profession page, render, set `preview_ready`, idempotent steps.
6. Limits and abuse controls: previews per user, daily cap, image-call cap, graceful stop + admin alert.
7. Web: `/book/{id}/progress` (single doc listener), `/book/{id}` preview viewer (StPageFlip, edit dedication, pick 8 professions, one regeneration).
8. Signed URL Function (15-minute, ownership check).
9. `preview-ready` email via Trigger Email extension.
10. Failure path: `preview_failed`, apology email, no limit charge.

Done when: preview p90 < 4 minutes on dev with real Vertex calls and cost tracked per book.

---

## Milestone 5: Checkout and full book (weeks 7–8)

Owner decisions needed: printer, formats and trim size, prices.

Steps:
1. `config/pricing`; `createPayment` Function (server-side price); Razorpay (India) and Stripe (international) adapters, test mode.
2. Webhook Functions: signature verification, processed-event-ID idempotency, set `paid`, start `fullbook` workflow. Contract tests with mocked gateways.
3. `/book/{id}/checkout` (PIN validation, shipping encrypted via KMS), `/orders`.
4. `workflows/fullbook.yaml` + Cloud Tasks fan-out on `page-gen` (max 4 concurrent per book), retries, backoff, fallback model, `needs_human`, `generation_blocked`.
5. `/services/upscale` (Real-ESRGAN, CPU, config-switchable).
6. Admin console `/admin`: custom claim from `admin-emails`, review queue, approve/regenerate/pick candidate, approve book, blocked/failed list, orders by ID, config editor with audit, metrics.
7. Print PDF build in render service at printer spec, embedded fonts, optional CMYK, preflight script (page count, size, 300 DPI, bleed, fonts).
8. `PrinterAdapter` interface + `MockPrinterAdapter`.
9. `order-confirmed` and `book-approved` emails, GST invoice PDF.
10. Integration test: upload → preview → payment webhook → full book → review → PDF.

Done when: a test payment produces an approved, preflighted print PDF. Owner applies for Start-tier credits.

---

## Milestone 6: Fulfilment and privacy (week 9)

Steps:
1. Real printer adapter for the chosen printer; webhook or 2-hourly Scheduler poll; `shipped` and `delivered` handling and emails.
2. Purge job (Cloud Scheduler, daily): photos/embeddings 30 days after delivery, abandoned drafts, audit entries; `photos-deleted` email.
3. `/account`: delete photos now, delete account and all books.
4. Cost caps and budget kill-switch Function on `billing-alerts`.
5. Automated log scan for child data after a full test run.
6. Refund flow in admin.
7. Orders `preview-reminder` (marketing consent only).

Done when: one real test book is printed and delivered, and purge is verified.

---

## Milestone 7: Launch readiness (week 10)

Steps:
1. Owner repeats §4 for `storybook-prod`; Terraform and CI deploy to prod.
2. k6 load test (50 concurrent previews, queue honours rate limits).
3. Legal pages (owner-supplied, lawyer-reviewed), consent text finalised.
4. Monitoring: alerts, Error Reporting, BigQuery export, analytics funnel without child data.
5. Lighthouse mobile ≥ 85, accessibility pass, iOS Safari / Android Chrome viewer check.
6. Finish `docs/runbook.md`; file Google approval in `docs/decisions.md`.
7. Walk through every acceptance box in §12.

Done when: all §12 acceptance boxes are ticked.

---

## Critical path and risks

- **Google approval for minors' images**: start now; blocks public launch.
- **Likeness quality (M1)**: if the target isn't met, revisit model choice before building anything else.
- **Image cost** (~₹460/book): caps and cost tracking are built in M4, not deferred.
- **Printer choice** gates M5 PDF specs; settle early.
- **Lawyer review** of consent/privacy under DPDP Act: schedule before M7.
