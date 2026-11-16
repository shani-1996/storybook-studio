# Owner setup checklist (spec section 4)

Tick each box. Never paste secret values anywhere; refer to Secret Manager secret names only.
Dev project ID: `book-dev-env` (spec default `storybook-dev` was not used). Region: `asia-south1`.

## A. Accounts and billing
- [x] Google Cloud account, free trial active (trial ends 2026-11-20)
- [ ] Upgrade billing account to paid (keeps remaining credit; avoids losing resources when the trial ends 2026-11-20). OWNER ACTION
- [x] Budget alerts (agent, 2026-11-16): `storybook-dev-100pln`, `-250pln`, `-500pln` (billing currency PLN, about INR 2,000/5,000/10,000), each alerting at 50% and 100% of gross spend (credits excluded), emailing billing admins and publishing to Pub/Sub topic `billing-alerts`. The kill-switch Function (milestone 6) will subscribe to the topic
- [ ] Apply for Google for Startups Cloud Program Start tier after milestone 5

## B. Projects (dev)
- [x] Project `book-dev-env` created, Firebase added, Blaze plan
- [x] Firestore (Native mode) in `asia-south1`; rules deployed
- [x] Default Storage bucket `book-dev-env.firebasestorage.app` in `asia-south1`; rules deployed
- [x] Auth: Email link enabled (agent)
- [x] Auth: Google sign-in enabled (owner, confirmed)
- [x] Auth: `localhost` added to authorised domains (agent). [ ] add the production domain once it exists
- [x] Web app `storybook-web-dev` registered; config saved in `apps/web/firebase-config.dev.json`
- [ ] **TODO LATER (owner, 2026-11-16):** App Check with reCAPTCHA v3 (site key). Do NOT enforce App Check on Firestore/Storage/Auth until the web app sends tokens; needed before the intake milestone goes to real users

## C. APIs (dev)
- [x] Vertex AI, Cloud Vision, Cloud Run, Cloud Functions, Cloud Build, Artifact Registry, Secret Manager
- [x] Workflows, Cloud Tasks, Pub/Sub, Cloud Scheduler, Eventarc, IAM Credentials, Firebase App Hosting, Firestore, Storage, Identity Toolkit, App Check APIs
- [ ] Vertex AI quota increase for the chosen image model (we hit HTTP 429 during the spike)
- [ ] Written confirmation / allowlist from Google for minors' images on Vertex AI image models

## D. Access for the agent and CI
- [x] `gcloud` and `firebase` CLIs installed and logged in
- [x] GitHub repository `shani-1996/storybook-studio` created and connected
- [x] Workload Identity Federation (agent, applied 2026-11-16): pool/provider `github`, limited to the repo on `main`; `sa-cicd` has firebaserules.admin, serviceusage consumer, firebase.viewer. Roles unverified until the first CI deploy runs
- [ ] OWNER: connect Firebase App Hosting to the repo (interactive, see below)

## E. Third-party accounts (test mode first)
- [ ] Razorpay, Stripe, SMTP provider (Brevo or Resend), printer sandbox, domain name

## F. Secrets (owner creates in Secret Manager)
`razorpay-key-id`, `razorpay-key-secret`, `razorpay-webhook-secret`, `stripe-secret-key`, `stripe-webhook-secret`, `smtp-uri`, `printer-api-key`, `admin-emails`

## G. Values to send the agent
Project number, Firebase web config, App Check site key, domain name, GitHub repo URL, SMTP provider, printer, and confirmation that each secret exists.
