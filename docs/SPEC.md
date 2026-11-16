# Build Spec: Personalised "When I Grow Up" Storybook App (GCP + Firebase)

Nov 16, 2026 · @Shani Kumar

## 1. How to use this spec

This spec tells an AI coding agent how to build, from an empty repository, a web app that turns three photos of a child into a personalised, printable 24-page "When I Grow Up" storybook on Google Cloud and Firebase. The human owner creates the cloud accounts and pastes in credentials; the agent writes, tests and deploys all code.

### Who does what

| Area | Human owner | AI agent |
| --- | --- | --- |
| Accounts, billing, credits | Creates GCP + Firebase project, billing, budget alerts, applies for credits | Tells the owner exactly what to click and which values to send back |
| Credentials | Creates service accounts, puts secrets in Secret Manager, never pastes secret values in chat | References secrets only by name |
| Vendor approvals | Gets Google's written OK / allowlist for minors' photos on Vertex AI image models | Builds code that works with or without the allowlist (fallback + clear error) |
| Story text and art direction | Approves verses, profession list, style reference images | Stores them as editable templates; never invents final copy silently |
| Code, infra-as-code, tests, deploys | Reviews pull requests, runs `firebase login` / `gcloud auth` when asked | Writes everything in this spec |
| Printer and payment accounts | Signs up with Razorpay, Stripe, printer | Integrates via their APIs in test mode first |

### Working rules for the agent

1. Build in the milestone order in section 13. Finish a milestone's definition of done before starting the next.
2. Before each milestone, list the values you need from the owner (project IDs, secret names, URLs) in one message. Do not guess them.
3. Use the Firebase Emulator Suite for all local work. Never call production Vertex AI from tests; use recorded fixtures.
4. Treat customer photos and child data as highly sensitive. Never log names, emails, photos, or signed URLs. Log order IDs only.
5. Keep all model names, prompts, verses, prices and limits in config (Firestore `config/*` or Remote Config), never hard-coded.
6. Write TypeScript with strict mode on. Every Cloud Function and Cloud Run service gets unit tests and an emulator integration test.
7. Prefer managed GCP and Firebase services and their free tiers (section 11). Ask before adding any paid third-party service not named here.
8. When a vendor API or price is uncertain, check the vendor's current docs and note the version and date in `docs/decisions.md`.
9. Open one pull request per milestone with a short summary, a test report and a list of anything the owner must do next.

## 2. Product overview and user flow

A parent or relative uploads three photos of a child aged 3 to 7, previews three personalised pages for free, pays, and receives a printed hardcover where the child appears as a doctor, pilot, astronaut and other future professions. The adult is always the user; the child is only the subject of the book.

### Inputs collected

| Field | Type | Rules | Used for |
| --- | --- | --- | --- |
| Child's first name | text | 1 to 20 letters, Unicode allowed, profanity filter | Title, every verse |
| Gender | girl / boy / prefer not to say | Required | Pronouns in verses (she / he / they), outfit cues |
| Age | 3, 4, 5, 6, 7 | Required | Apparent age in prompts, outfit sizing |
| Relationship to child | parent, grandparent, aunt/uncle, sibling, family friend, other | Required | Dedication sign-off, consent wording |
| Buyer email | email | Verified via Firebase email link | Login, preview link, order updates |
| Photos | 3 images, JPEG/PNG/HEIC, max 15 MB each | One child, face clearly visible | Identity reference |
| Consent | checkbox | Required; text in section 10 | Legal basis for processing |

### User flow

1. Landing page: sample book flip-through and "Create your book".
2. Sign in with email link or Google.
3. Enter child details and relationship.
4. Upload 3 photos; each is checked in under 5 seconds and the parent is told to replace any that fail, with the reason.
5. Confirm consent and start the preview.
6. Progress screen: hero portrait appears first (target under 60 s), then cover and one profession page (target under 4 minutes total).
7. Preview email is sent with a link back to the preview.
8. Preview page: page-flip viewer with cover, dedication and up to 3 illustrated pages, watermarked. Parent can edit the dedication text and pick professions (8 of the available list).
9. Optional: one free regeneration of the preview if the likeness is poor.
10. Checkout: hardcover or softcover, shipping address, Razorpay (India) or Stripe (international).
11. Full book is generated, scored and placed in the human review queue.
12. Reviewer approves or regenerates pages; print PDF is built and sent to the printer.
13. Parent gets order, shipped and delivered emails, plus a private online copy of the book.
14. Source photos are deleted 30 days after delivery, or immediately on the parent's request.

## 3. Tech stack and repository structure

Everything runs in one GCP project per environment (dev, prod), all in region `asia-south1` (Mumbai) except AI model endpoints that are only offered globally. Language is TypeScript everywhere except the face-scoring and upscaling services, which are Python.

| Layer | Choice | Notes |
| --- | --- | --- |
| Web app | Next.js (App Router) on Firebase App Hosting | Tailwind CSS; StPageFlip for the book viewer |
| Auth | Firebase Auth: email link + Google | No phone OTP (SMS costs money) |
| Bot protection | Firebase App Check with reCAPTCHA v3 | Enforced on Firestore, Storage and Functions |
| Database | Firestore (Native mode) | Security rules in repo, tested with emulator |
| Files | Cloud Storage for Firebase, 3 buckets | Lifecycle deletion rules (section 5) |
| Event functions | Cloud Functions (2nd gen), Node 20+ | Upload triggers, webhooks, emails |
| AI flows | Firebase Genkit (TypeScript) on Cloud Run | All Vertex AI calls go through Genkit flows |
| Image model | Gemini image model on Vertex AI (Nano Banana 2, model ID from config) | Nano Banana Pro optional for hero sheet + cover |
| Fallback image model | Imagen on Vertex AI (model ID from config) | Used when primary is blocked or fails |
| Judge model | Gemini Flash on Vertex AI | Defect and scene checks |
| Photo checks | Cloud Vision API face detection | Free for first 1,000 units per month |
| Face scoring | Python + InsightFace (ArcFace) on Cloud Run, CPU | Scale-to-zero |
| Upscaling | Python + Real-ESRGAN on Cloud Run, CPU at launch | Switch to GPU or Vertex upscale via config |
| Layout + PDF | Node + Puppeteer (headless Chrome) on Cloud Run | Same HTML templates for preview and print |
| Orchestration | Cloud Workflows + Cloud Tasks | Per-page fan-out, retries, rate limits |
| Email | Firebase Trigger Email extension + SMTP provider (Brevo or Resend) | Templates in Firestore |
| Payments | Razorpay + Stripe via Cloud Functions webhooks | Test mode until launch |
| Printing | Printer REST API (chosen in section 14) behind an adapter interface | Mock adapter for dev |
| Config | Firestore `config/*` + Remote Config | Prompts, models, prices, limits |
| Infra as code | Terraform for GCP resources; `firebase.json` for Firebase | Agent writes, owner applies first time |
| CI/CD | GitHub Actions + Workload Identity Federation | No long-lived keys in GitHub |
| Monitoring | Cloud Logging, Error Reporting, Cloud Monitoring alerts, BigQuery export | Funnel analytics via Google Analytics for Firebase |

### Repository layout (pnpm monorepo)

```
/apps/web                 Next.js app: customer site + /admin review console
/functions                Cloud Functions: triggers, webhooks, email, cleanup
/services/genkit-flows    Genkit flows: hero sheet, page generation, judge (Cloud Run)
/services/face-score      Python: InsightFace detect + embed + compare (Cloud Run)
/services/upscale         Python: Real-ESRGAN upscaling (Cloud Run)
/services/render          Node: HTML page templates -> PNG previews and print PDF (Cloud Run)
/workflows                Cloud Workflows YAML: preview.yaml, fullbook.yaml
/packages/shared          Types, Zod schemas, config loader, story templates
/content                  Verses, profession definitions, style reference images (owner-approved)
/infra/terraform          Buckets, service accounts, IAM, Workflows, Tasks queues, alerts
/firestore.rules  /storage.rules  /firebase.json
/docs                     decisions.md, runbook.md, setup-checklist.md
```

## 4. Human setup checklist (GCP + Firebase)

The owner completes these steps once per environment, starting with dev; the agent can then do everything else through Terraform and CI. Tick each box and send the agent the values listed at the end.

### A. Accounts and billing

- [ ] Create a Google Cloud account with a business Google account (not a personal Gmail used elsewhere) and activate the $300 free trial.
- [ ] Upgrade the billing account to paid straight away (remaining trial credit is kept) to avoid trial quota limits.
- [ ] Create budget alerts at ₹2,000, ₹5,000 and ₹10,000 per month, sending to the owner's email and to a Pub/Sub topic `billing-alerts`.
- [ ] Apply for the Google for Startups Cloud Program Start tier once the MVP is live (milestone 5). Do not accept any other GCP promo credits before that.

### B. Projects

- [ ] Create two projects: `storybook-dev` and `storybook-prod` (the agent will use these IDs; tell it if you pick different ones).
- [ ] In the Firebase console, add Firebase to both projects and switch them to the Blaze plan.
- [ ] Create Firestore (Native mode) in `asia-south1` in both projects. The region cannot be changed later.
- [ ] Create the default Storage bucket in `asia-south1`.
- [ ] In Firebase Auth, enable Email link (passwordless) and Google sign-in. Add the app's domains to authorised domains.
- [ ] Register a Web app in Firebase and copy its config object.
- [ ] In App Check, register reCAPTCHA v3 for the web app and copy the site key.

### C. Enable APIs (both projects)

- [ ] Vertex AI, Cloud Vision, Cloud Run, Cloud Functions, Cloud Build, Artifact Registry, Workflows, Cloud Tasks, Pub/Sub, Cloud Scheduler, Secret Manager, Eventarc, IAM Credentials, Firebase App Hosting.
- [ ] Request Vertex AI quota increases for the chosen Gemini image model (images per minute) before launch.
- [ ] Ask Google Cloud sales / support for written confirmation that a parent-operated service may process children's photos with the Vertex AI image models, and for any allowlist needed for generating images of minors. Save the reply in `docs/decisions.md`.

### D. Access for the agent and CI

- [ ] Install `gcloud` and `firebase` CLIs locally; run `gcloud auth login`, `gcloud auth application-default login` and `firebase login` when the agent asks.
- [ ] Create a GitHub repo and give the agent access.
- [ ] Grant yourself Owner; the agent's Terraform will create least-privilege service accounts: `sa-web`, `sa-functions`, `sa-genkit`, `sa-faceScore`, `sa-upscale`, `sa-render`, `sa-workflows`, `sa-ci`.
- [ ] Set up Workload Identity Federation for GitHub Actions (the agent provides the exact commands).

### E. Third-party accounts (test mode first)

- [ ] Razorpay: business account, test keys, webhook secret.
- [ ] Stripe: account, test keys, webhook secret.
- [ ] SMTP email provider (Brevo or Resend): verify sending domain (SPF, DKIM, DMARC).
- [ ] Printer: account and sandbox API key (see section 14).
- [ ] Domain name, with DNS access for App Hosting and email records.

### F. Secrets (owner creates in Secret Manager; never paste values to the agent)

| Secret name | Contents |
| --- | --- |
| `razorpay-key-id`, `razorpay-key-secret`, `razorpay-webhook-secret` | Razorpay credentials |
| `stripe-secret-key`, `stripe-webhook-secret` | Stripe credentials |
| `smtp-uri` | SMTP connection string for the email extension |
| `printer-api-key` | Printer API key |
| `admin-emails` | Comma-separated emails allowed into /admin |

### G. Values to send the agent

Project IDs, project numbers, Firebase web config, App Check site key, domain name, GitHub repo URL, chosen SMTP provider, chosen printer, and confirmation that each secret above exists.

## 5. Data model and storage layout

Firestore holds orders and their state machine; Cloud Storage holds images in three buckets with automatic deletion. Child data lives only inside the `books` document and its storage folder, so one delete removes everything.

### Firestore collections

| Path | Key fields | Written by | Read by |
| --- | --- | --- | --- |
| `users/{uid}` | email, createdAt, previewCount, marketingOptIn | Functions | Owner user |
| `books/{bookId}` | ownerUid, child {firstName, gender, age}, relationship, status, professions\[\], dedicationText, heroSheetPath, consent {version, acceptedAt, ip hash}, previewRegenUsed, createdAt, deleteAfter | Web (create, limited fields), Functions | Owner user, admins |
| `books/{bookId}/photos/{photoId}` | storagePath, checkStatus (pending/pass/fail), failReason, faceBox, qualityScores, embeddingRef | Functions | Owner user (status only) |
| `books/{bookId}/pages/{pageNo}` | templateId, professionId, status, candidates\[\] {path, faceScore, judgeScore, judgeNotes, model}, selectedCandidate, reviewStatus, attempt | Workflows, admin | Owner user (selected only), admins |
| `orders/{orderId}` | bookId, ownerUid, format (hardcover/softcover), priceInr, currency, gateway, gatewayRef, paymentStatus, shipping (stored encrypted), printerOrderId, fulfilmentStatus, tracking | Functions only | Owner user, admins |
| `config/models` | primaryImageModel, fallbackImageModel, judgeModel, resolution, candidatesPerPage, retryLimit | Owner via admin | Services |
| `config/limits` | previewsPerUser, regensPerBook, maxDailyPreviews, faceScoreMin, judgeScoreMin | Owner via admin | Services |
| `config/pricing` | hardcoverInr, softcoverInr, intlUsd, shippingRules | Owner via admin | Web, Functions |
| `templates/{templateId}` | professionId, layout (text side, colours), promptTemplate, negativeRules, verse {she, he, they}, titleWord | Owner via admin | Services |
| `mail/{id}` | to, template, data | Functions | Trigger Email extension |
| `audit/{id}` | actor, action, bookId, at | Functions | Admins |

### Book status state machine

`draft` → `photos_checking` → `photos_ready` → `preview_generating` → `preview_ready` → `paid` → `book_generating` → `in_review` → `approved` → `print_ready` → `sent_to_printer` → `shipped` → `delivered` → `purged`. Side states: `photos_failed`, `preview_failed`, `generation_blocked` (model refused), `cancelled`, `refunded`. Only Cloud Functions or Workflows may change status; every change writes an `audit` entry.

### Cloud Storage buckets (all `asia-south1`, uniform access, no public objects)

| Bucket | Path pattern | Lifecycle rule |
| --- | --- | --- |
| `{project}-uploads` | `books/{bookId}/photos/{photoId}.jpg` | Delete 30 days after `deleteAfter` metadata; hard max 120 days |
| `{project}-generated` | `books/{bookId}/hero/*`, `books/{bookId}/pages/{pageNo}/{candidateId}.png` | Rejected candidates deleted by workflow immediately; rest deleted 180 days after delivery |
| `{project}-print` | `books/{bookId}/print.pdf`, `books/{bookId}/preview/*.webp` | Print PDF deleted 90 days after delivery; previews deleted with the book |

The browser uploads photos directly to `uploads` through Storage security rules (owner only, image MIME types, under 15 MB, max 3 per book). All other access uses short-lived signed URLs (15 minutes) issued by a Function after an ownership check. Preview images are watermarked, max 1200 px wide.

## 6. Generation pipeline

Likeness and consistency come from a fixed sequence: check photos, build one approved hero portrait, generate several candidates per page from that portrait plus the photos, score them automatically, and keep the best. Text is never drawn by the image model; it is laid over the art by the render service.

### Step 1: Photo check (Cloud Function on upload to `uploads`)

1. Convert HEIC to JPEG, strip EXIF (including GPS), resize to max 2048 px long edge.
2. Call Cloud Vision face detection. Fail with a parent-friendly reason if: no face, more than one face, face under 15% of image width, detection confidence under 0.8, blurred or under-exposed likelihood LIKELY or higher, head roll or tilt over 25°, or headwear/sunglasses detected.
3. Call `face-score /embed` to store a 512-d ArcFace embedding (in the photo doc or a sidecar file, never logged).
4. Check the 3 embeddings match each other (cosine similarity ≥ 0.45, configurable). If not, ask the parent to make sure all photos are of the same child.
5. When 3 photos pass, set status `photos_ready`.

### Step 2: Preview workflow (`workflows/preview.yaml`)

1. Check limits: user `previewCount` under `config/limits.previewsPerUser` and global `maxDailyPreviews` not exceeded; else stop with a friendly message.
2. **Hero sheet:** call Genkit flow `heroSheet` with the 3 photos and the style references. Generate 3 candidates. Score each (step 4). Save the best as `heroSheetPath`.
3. **Preview pages:** cover + one profession page (the parent's first pick, default Doctor), 2 candidates each, inputs = hero sheet + 3 photos + template prompt.
4. Score, select, render pages with text (section 7), watermark, save WebP previews.
5. Set `preview_ready`, increment `previewCount`, enqueue preview email.

### Step 3: Full-book workflow (`workflows/fullbook.yaml`, started by payment webhook)

1. Reuse the hero sheet and already-selected preview pages.
2. For each remaining illustrated page, create a Cloud Task (queue `page-gen`, max 4 concurrent per book, global rate set from Vertex quota).
3. Each task: generate N candidates (`config/models.candidatesPerPage`, default 3), score, select best that passes thresholds; if none pass, retry up to `retryLimit` (default 2) with a varied seed and prompt tweak; then mark the page `needs_human`.
4. When all pages are done, set `in_review`.
5. After admin approval: upscale each selected image, render print pages, build print PDF, set `print_ready`, call printer adapter.

### Step 4: Scoring each candidate

| Check | Service | Pass rule (config) |
| --- | --- | --- |
| Face present, exactly one main child | `face-score /detect` | 1 face ≥ 8% of image width (more allowed only if the template expects extra people) |
| Likeness | `face-score /compare` vs. mean of 3 photo embeddings | cosine ≥ `faceScoreMin` (start 0.40, tune in milestone 1) |
| Defects and scene match | Genkit flow `judge` (Gemini Flash, JSON output) | Returns {hands\_ok, extra\_limbs, extra\_children, outfit\_matches, props\_match, age\_looks\_right, style\_matches, text\_in\_image, score 0–10}; pass if score ≥ `judgeScoreMin` (start 7) and no hard fails |
| Selection | Workflow | Highest of (0.6 × normalised face score + 0.4 × judge score) among passing candidates |

### Model calls (Genkit flows)

- Primary model ID, fallback model ID, resolution (default 2K) and aspect ratio (4:3 landscape, matching the sample pages) come from `config/models`.
- Image inputs per page call: hero sheet + 3 cropped face photos + the template's style reference image. Keep total within the model's reference-image limit.
- Prompt = template `promptTemplate` filled with child age, pronoun, profession scene, outfit, props, background, composition (child on the side opposite the text panel), plus fixed style block and fixed rules: one child only, no text or letters in the image, no logos, child-appropriate, keep face identical to references.
- Store every request's model ID, prompt hash, seed (if supported), latency and token usage on the candidate for cost tracking. Never store prompts containing the child's name in logs.

### Errors and fallbacks

| Situation | Detection | Action |
| --- | --- | --- |
| Safety block (no image returned, block/finish reason set, even with HTTP 200) | Response has no image part | Retry once with the same prompt; then switch to fallback model; then mark `generation_blocked` and alert admin |
| Quota / 429 | HTTP status | Exponential backoff via Cloud Tasks retry config (min 10 s, max 10 min, 6 attempts) |
| Timeout / 5xx | HTTP status | Same as quota |
| All candidates fail scoring | Scores | Retry policy above, then `needs_human` |
| Preview fails completely | Workflow error | Status `preview_failed`, apologise by email, do not count against preview limit |

All Workflows and Tasks are idempotent: each step checks Firestore before acting so a retry never double-charges or double-generates.

## 7. Story content and page templates

The book is 24 pages, landscape 4:3, matching the samples: cover, dedication, intro spread, 8 profession pages chosen by the parent, closing pages. Verses are owner-written and stored per pronoun; the agent seeds placeholders and never ships invented copy without owner approval.

### Page plan (24 pages)

| Page | Content | Illustration |
| --- | --- | --- |
| 1 | Cover: "When {name} Grows Up", child looking up, floating profession icons | Yes |
| 2 | Dedication: "Dear {name}" + editable message + sign-off from relationship | No (decorative watercolour border, static asset) |
| 3 | Intro art: child with starry dream cloud | Yes |
| 4 | Intro verse: "What does {name} want to be…" | No (static watercolour corner) |
| 5–20 | 8 professions, each as a 2-page spread or a single page with art + verse panel (layout per template) | 8 to 16 images |
| 21–22 | "Whatever you choose…" closing art + verse | Yes |
| 23 | "This book belongs to {name}" with a small portrait | Yes (reuse hero sheet) |
| 24 | Back cover: short blurb, no child data except first name | No |

The owner decides between single-page professions (about 12 illustrations per book) or full spreads (about 20). Costs in section 11 assume about 15.

### Profession catalogue (initial)

Doctor, Pilot, Astronaut, Scientist, Artist, Chef, Footballer, Cricketer, Engineer, Teacher, Musician, Firefighter, Veterinarian, Architect, Photographer, Explorer. Parent picks 8; defaults are the first 8.

### Template definition (one per profession, in `/content/templates/*.json`, synced to Firestore)

```json
{
  "id": "doctor",
  "titleWord": "DOCTOR",
  "titleColour": "#8CC7C4",
  "textSide": "right",
  "verse": {
    "she": "When {name} grows up,\nshe might choose to be...",
    "he":  "When {name} grows up,\nhe might choose to be...",
    "they": "When {name} grows up,\nthey might choose to be..."
  },
  "scene": "child in a white doctor's coat with a stethoscope, gentle smile, soft blue-grey watercolour wash background",
  "outfit": { "girl": "...", "boy": "...", "neutral": "..." },
  "composition": "child on left two-thirds, right third kept light and empty for text",
  "styleRef": "content/style/watercolour-01.png"
}
```

### Text rendering rules (render service)

- Fonts: a rounded handwritten font for verses and a bold brush-style font for profession titles, both with licences that allow commercial print (owner confirms). Embed fonts in the PDF.
- Names longer than 10 characters reduce font size; test with 20-character names and names in Devanagari.
- Text never overlaps the child's face: render service reads the face box from `face-score /detect` and moves or shrinks the text panel if needed.
- Preview and print use the same HTML templates so what the parent sees is what gets printed.
- Language: English at launch; templates have a `lang` key so Hindi can be added later.

## 8. Frontend pages and admin console

The customer site is mobile-first (most Indian buyers will be on phones) and the admin console lives at `/admin`, restricted to emails in the `admin-emails` secret via a custom auth claim.

### Customer pages

| Route | Purpose | Key requirements |
| --- | --- | --- |
| `/` | Landing | Sample book flip-through, how it works in 3 steps, price, FAQ, privacy promise |
| `/sign-in` | Email link + Google | Returns user to where they were |
| `/create/details` | Name, gender, age, relationship | Zod validation shared with backend; live title preview "When {name} Grows Up" |
| `/create/photos` | Upload 3 photos | Good/bad photo examples, per-photo status chip (checking / OK / replace + reason), camera capture on mobile |
| `/create/consent` | Consent and start | Consent text (section 10) with version number; button disabled until ticked |
| `/book/{bookId}/progress` | Live status | Firestore listener; hero portrait shown as soon as ready; can leave and come back via email |
| `/book/{bookId}` | Preview | StPageFlip viewer, watermarked pages, edit dedication, pick 8 professions, "Regenerate preview" (once), "Order" |
| `/book/{bookId}/checkout` | Format, address, pay | Indian PIN-code validation, Razorpay Checkout / Stripe Checkout redirect |
| `/orders` | Order list and tracking | Status timeline, online copy once approved |
| `/account` | Data controls | Delete my photos now, delete account and all books |
| `/privacy`, `/terms` | Legal pages | Owner supplies text |

### Admin console (`/admin`)

- **Review queue:** books in `in_review`, oldest first. For each page show the selected candidate beside the 3 source photos, the face and judge scores, and the other candidates. Actions: approve page, pick another candidate, regenerate page (with optional prompt note), flag book.
- **Approve book:** enabled only when every page is approved; triggers print step.
- **Orders:** search by order ID only (no name search, to limit exposure of child data), status, printer status, refund button.
- **Blocked / failed:** books in `generation_blocked`, `preview_failed`, `needs_human`.
- **Config:** edit `config/*` and templates with validation and an audit entry per change.
- **Metrics:** previews started and completed, conversion, average scores, generation cost per book, review time per book.

### UX and quality requirements

- Lighthouse mobile score ≥ 85 on landing; images in WebP/AVIF; viewer works on iOS Safari and Android Chrome.
- All copy in `/content/ui/en.json` for later translation.
- Accessible: labels on all inputs, focus states, alt text on sample pages, colour contrast AA.

## 9. Payments, email, print PDF and fulfilment

Money and physical orders only move on verified webhooks, and every external call goes through an adapter so providers can be swapped or mocked.

### Payments

- Indian addresses use Razorpay (UPI, cards, netbanking); other countries use Stripe Checkout. Price comes from `config/pricing`, never from the browser.
- Flow: Function `createPayment` creates the order server-side and returns the gateway session → customer pays → webhook Function verifies the signature → sets `orders.paymentStatus = paid` and `books.status = paid` → starts `fullbook` workflow.
- Webhooks are idempotent (store processed event IDs). Unverified or duplicate events are ignored and logged by event ID only.
- Refund: admin button calls gateway refund API; allowed before `sent_to_printer`, or after for reprints by owner decision.
- GST invoice PDF generated per order (owner confirms GST treatment with their accountant).

### Email (Trigger Email extension, templates in Firestore)

| Template | Trigger |
| --- | --- |
| `sign-in-link` | Firebase Auth (built-in) |
| `photo-problem` | Photo fails check and user has left the page |
| `preview-ready` | `preview_ready` |
| `preview-reminder` | 48 h after preview with no order (max 1 reminder; only if marketing consent given) |
| `order-confirmed` | Payment verified |
| `book-approved` | Admin approves; includes link to online copy |
| `shipped` | Printer webhook or poll; includes tracking link |
| `photos-deleted` | Purge job completes |

Emails contain the child's first name only, no photos as attachments, and links that require sign-in.

### Print PDF

- Trim size and bleed from the printer's spec (likely 8.5 × 11 in or A4 landscape, 3 mm / 0.125 in bleed, 300 DPI). Store spec in `config/print`.
- Render service builds each page at final pixel size, places upscaled art and text, then exports a single PDF with embedded fonts; colour conversion to CMYK uses the printer's ICC profile if they require CMYK.
- Automated preflight: page count, page size, image resolution ≥ 300 DPI at placed size, no text in bleed area, fonts embedded. Fail loudly to admin if any check fails.

### Printer integration

- Interface `PrinterAdapter { quote(), createOrder(), getStatus(), cancel() }` with `MockPrinterAdapter` for dev and one real adapter for the chosen printer.
- The PDF is passed by a signed URL valid for 24 hours, or uploaded if the printer requires it.
- Status is updated by the printer's webhook if offered, otherwise a Cloud Scheduler job polls every 2 hours.
- Shipping address is stored encrypted at rest (Cloud KMS) and only decrypted inside the printer Function.

## 10. Security, privacy and child-data compliance

Children's photos are the most sensitive data the business holds, so the default is: collect the minimum, keep it in India where possible, never use it for anything but this book, and delete it on a schedule. The owner must have a lawyer review consent and privacy text against India's DPDP Act before launch.

### Rules the code must enforce

1. Only signed-in adults can create books; the consent step records that the user is the parent/guardian or has the guardian's permission, with consent text version and timestamp.
2. Child data (first name, gender, age, photos, embeddings, generated images) is stored only under the book; no child data in analytics events, logs, error reports, URLs or email subjects.
3. Photos and generated images go only to paid Vertex AI endpoints in this project. Never to the Gemini Developer API free tier or any consumer app.
4. Firestore and Storage rules: owner-only read on their books; writes from the client limited to draft fields and photo uploads; everything else server-side. Rules have emulator tests for every collection.
5. App Check enforced on Firestore, Storage, Functions and Cloud Run endpoints exposed to the web.
6. Service accounts are least privilege (one per service); no service account keys; CI uses Workload Identity Federation.
7. Encryption at rest is Google default plus Cloud KMS for shipping addresses and face embeddings.
8. Scheduled purge (Cloud Scheduler daily): delete source photos and embeddings 30 days after delivery; delete everything for books abandoned in `draft` or `preview_ready` for 30 days; record purge in `audit`.
9. "Delete my data" in `/account` runs the purge immediately (except order and invoice records required by law, which keep no child photo).
10. Abuse controls: one free preview per account and one regeneration per book (configurable), daily global preview cap, reCAPTCHA score threshold, and a way to report misuse on the landing page.
11. Admin access logged in `audit`; admins see photos only inside the review screen.

### Consent text (draft for the owner's lawyer)

> I am this child's parent or legal guardian, or I have their permission to create this book. I agree that the photos I upload will be used only to create this personalised book, processed by our cloud and AI providers on our behalf, and deleted within 30 days after delivery or sooner if I ask.

### Provider policy risk

Google's terms for its image models may restrict generating images of minors. The code must treat a refusal as a normal outcome (section 6), and the owner must secure written approval or an allowlist from Google before public launch.

## 11. Cost controls, free tier and quotas

Image generation is about 95% of cloud cost (roughly ₹460 per book plus about ₹80 per free preview at 2K on Nano Banana 2), so the code must measure and cap it; everything else should stay inside GCP and Firebase free tiers at launch volumes. Figures are estimates from November 2026 pricing; the agent re-checks current Vertex AI prices in milestone 1.

### Design choices that keep infrastructure free

- Face scoring and upscaling run on Cloud Run **CPU** with min instances 0 (GPU is not in the free tier). Switch to GPU via config only when volume needs it.
- Email link and Google sign-in instead of phone OTP (no SMS cost).
- Cloud Vision used only once per uploaded photo (1,000 free units a month covers about 330 books).
- Rejected candidates deleted immediately; WebP previews; lifecycle rules on all buckets.
- Firestore reads kept low: progress page uses one document listener, admin lists are paginated.
- Cloud Workflows step count kept low by fanning out with Cloud Tasks rather than Workflow loops.

### Cost tracking and caps (must be built)

- Every model call records its estimated cost on the candidate (tokens × price from `config/models`); totals roll up to `books/{id}.costEstimateUsd`.
- Admin metrics show cost per preview, per paid book and per day.
- Hard caps in `config/limits`: previews per user (1), regenerations per book (1), max candidates per page (4), max daily previews (start 200), max daily image calls (start 2,000). Hitting a cap stops new work gracefully and alerts admin.
- Budget alert Pub/Sub topic `billing-alerts` triggers a Function that, at 100% of the monthly budget, sets `config/limits.maxDailyPreviews = 0` (paid orders keep processing).

### Credits

Use the $300 trial credit for milestones 1 to 4 (testing). Apply for the Google for Startups Start tier ($2,000) at milestone 5. Credits do not cover printing, shipping, payment fees or the SMTP provider.

## 12. Testing and acceptance criteria

The app is ready for paying customers when the likeness test set passes, an end-to-end test order arrives printed correctly, and all security tests pass.

### Automated tests

| Type | Tooling | Must cover |
| --- | --- | --- |
| Unit | Vitest (TS), pytest (Python) | Schemas, prompt builder, scoring and selection, state machine, pricing |
| Security rules | Firebase Emulator + `@firebase/rules-unit-testing` | Every collection and bucket: owner, other user, signed-out, admin |
| Integration | Emulator Suite + recorded Vertex fixtures | Upload → photo check → preview → payment webhook → full book → review → PDF |
| Contract | Mock gateways and printer | Webhook signatures, idempotency, retries |
| Visual | Playwright screenshots | Every template with names of 3, 10 and 20 characters, she/he/they |
| Load | k6 against dev | 50 concurrent previews without errors; queue respects rate limits |
| PDF preflight | Script in render service | Size, bleed, 300 DPI, fonts embedded |

### Likeness test set (milestone 1)

- 20 to 30 consenting families' photo sets covering ages 3 to 7, girls and boys, a range of skin tones, hair types, and glasses.
- For each, generate the hero sheet and 4 profession pages.
- Owner and 2 other people rate each page 1 to 5 for "looks like this child". Target: average ≥ 4.0 and no set below 3.0.
- Use the ratings to set `faceScoreMin` and `judgeScoreMin` so automated selection agrees with human picks at least 80% of the time.

### Acceptance criteria for launch

- [ ] Photo check result shown in under 5 seconds per photo.
- [ ] Preview ready in under 4 minutes at p90.
- [ ] Full book ready for review in under 20 minutes at p90.
- [ ] Under 10% of pages need human regeneration.
- [ ] Generation cost per paid book within 20% of the section 11 estimate.
- [ ] Test order printed and delivered with correct colours, crop and text.
- [ ] Purge job verified: photos, embeddings and candidates gone after the set period.
- [ ] No child data found in logs after a full test run (automated log scan).
- [ ] Lawyer-approved consent, privacy policy and terms published.
- [ ] Written approval or allowlist from Google for minors' images on the chosen model.

## 13. Build milestones

The agent builds in seven milestones over about 10 weeks; milestone 1 proves likeness quality before any app is built, because nothing else matters if the child doesn't look like the child.

1. **Quality spike (week 1–2).** Owner: sections 4A–4C for dev. Agent: scripts in `/services/genkit-flows/spike` that run hero sheet + 4 profession pages on the likeness test set with Nano Banana 2 and Nano Banana Pro, plus face scoring.
   - Done when: owner ratings meet the section 12 target, model and thresholds chosen, real cost per page recorded in `docs/decisions.md`.
2. **Foundation (week 3).** Monorepo, Terraform, service accounts, buckets, Firestore and Storage rules with tests, CI/CD with Workload Identity Federation, App Hosting deploy of a placeholder site, Emulator Suite setup.
   - Done when: a push to `main` deploys to dev and all rule tests pass.
3. **Intake (week 4).** Sign-in, details, photo upload, photo check Function, consent, Vision + face-score services.
   - Done when: 3 good photos reach `photos_ready` and bad photos show the right reason, in emulator and dev.
4. **Preview (week 5–6).** Genkit flows, preview workflow, scoring, render service, watermarking, progress page, preview viewer, preview email, limits.
   - Done when: preview p90 under 4 minutes on dev with real Vertex calls and cost is tracked per book.
5. **Checkout and full book (week 7–8).** Razorpay + Stripe test mode, full-book workflow with Cloud Tasks fan-out, fallbacks, admin review console, upscaling, print PDF + preflight, mock printer.
   - Done when: a test payment produces an approved, preflighted print PDF. Owner applies for the Start tier credits.
6. **Fulfilment and privacy (week 9).** Real printer adapter, shipping emails, purge jobs, account deletion, cost caps, budget kill-switch, log scan.
   - Done when: one real test book is printed and delivered, and purge is verified.
7. **Launch readiness (week 10).** Prod project setup (owner repeats section 4 for prod), load test, legal pages, Google approval on file, monitoring alerts, runbook.
   - Done when: every acceptance box in section 12 is ticked.

## 14. Open decisions for the owner

The agent can start milestones 1 and 2 without these, but each must be settled before the milestone listed.

| Decision | Options | Needed by |
| --- | --- | --- |
| Primary image model | Nano Banana 2 vs. Nano Banana Pro (or Pro for hero + cover only) | End of milestone 1 |
| Pages per profession | Single page (\~12 images/book) vs. spread (\~20) | Milestone 4 |
| Final verses and profession list | Owner writes or approves all copy | Milestone 4 |
| Fonts | Licensed handwritten + brush fonts for print | Milestone 4 |
| Printer | Indian printer with API vs. Gelato / Lulu | Milestone 5 |
| Book formats and trim size | Hardcover / softcover; A4 landscape vs. 8.5 × 11 in | Milestone 5 |
| Prices | Suggested ₹2,499–2,999 hardcover, ₹1,799–1,999 softcover | Milestone 5 |
| SMTP provider | Brevo vs. Resend | Milestone 4 |
| Free preview size | Cover + 1 page (cheaper) vs. cover + 2 pages | Milestone 4 |
| International shipping at launch | India only vs. India + selected countries | Milestone 6 |
| Data retention periods | 30-day photo deletion proposed; lawyer confirms | Milestone 6 |
| Google approval for minors' images | Written confirmation / allowlist | Before public launch |
