# Milestone 2 report: Foundation

Date: 2026-11-16. Environment: dev (`book-dev-env`, project number 420016114828).

## What was built

| Area | Result |
| --- | --- |
| Monorepo | pnpm workspace: `apps/web`, `packages/shared`, `services/genkit-flows`, `services/face-score`, `tests/rules`, `infra/terraform`, `content/stories/when-i-grow-up` |
| Data model | Book status state machine and Zod schemas in `packages/shared`; `storyId` on every book for multi-story support |
| Security rules | `firestore.rules`, `storage.rules`, deployed to dev; owner-only reads, draft-only client writes, 3 fixed photo slots, no client reads of photos |
| Infrastructure | Terraform applied: 3 private buckets with lifecycle deletion, 8 service accounts (least privilege), `page-gen` task queue (4 concurrent, 6 attempts), Artifact Registry, Workload Identity Federation |
| CI/CD | GitHub Actions: typecheck, unit tests, Python tests, rules tests; deploy of rules to dev on push to `main` through Workload Identity Federation (no stored keys, only this repo and branch) |
| Web | Placeholder Next.js app live on Firebase App Hosting (`storybook-studio`, asia-southeast1), auto-rollout from `main` |
| Cost safety | Budgets `storybook-dev-100pln`, `-250pln`, `-500pln` (alerts at 50% and 100%) and Pub/Sub topic `billing-alerts` |

## Test results

| Suite | Result |
| --- | --- |
| Shared package (Vitest) | 33 passed |
| Genkit pipeline (Vitest) | 22 passed |
| Face-score service (pytest) | 8 passed |
| Security rules (Firebase emulators) | 59 passed |
| Terraform | validate passes; apply of 37 resources; no drift afterwards |
| CI run on `main` | green (test and deploy-dev) |
| App Hosting build | green; site returns HTTP 200 |

## Definition of done (spec section 13)

"A push to `main` deploys to dev and all rule tests pass." Met.

## Differences from the spec

- Service account names: `sa-face-score` and `sa-cicd` (GCP requires 6 to 30 characters).
- App Hosting region `asia-southeast1` (Mumbai not offered); child data does not pass through it.
- `apps/web` has its own npm lock file (App Hosting requirement); see `docs/decisions.md`.
- Milestone work was pushed directly to `main`, not through a pull request.

## Not done / carried over

- Milestone 1 gate (likeness test on 20 to 30 children aged 3 to 7, rated by 3 people, average 4.0 or higher) is NOT met; only one child (age 1) was tested. Must be settled before Milestone 4.
- App Check with reCAPTCHA v3: TODO LATER (owner decision). Do not enforce until the web app sends tokens.
- Model prices are not verified on Google's pricing page; cost figures in `docs/decisions.md` are estimates.

## Owner actions

1. Upgrade the billing account to paid before the trial ends on 2026-11-20 (resources are suspended otherwise).
2. Get Google's written approval for minors' photos on Vertex AI image models, and request a Vertex AI image-model quota increase (HTTP 429 seen during the spike).
3. Recruit 20 to 30 consenting families (children aged 3 to 7) for the likeness test.
4. Provide for Milestone 3: nothing blocking; App Check site key later.
5. Decide before Milestone 4: pages per profession, verses and profession list, fonts, SMTP provider, free preview size.
6. Move CI and the dev machine to Node 22 (Node 20 is end of life); agent can do the CI part on request.
