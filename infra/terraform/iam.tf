# One least-privilege service account per service (spec section 10, rule 6). No keys are created.
# GCP account IDs allow 6-30 lowercase letters, digits and hyphens, so the spec names differ: `sa-faceScore` -> `sa-face-score`, `sa-ci` -> `sa-cicd`.

locals {
  service_accounts = {
    web        = "Next.js app on App Hosting"
    functions  = "Cloud Functions: triggers, webhooks, email, cleanup"
    genkit     = "Genkit flows (Vertex AI calls)"
    face-score = "Face detection and scoring service"
    upscale    = "Upscaling service"
    render     = "Page render and print PDF service"
    workflows  = "Cloud Workflows orchestration"
    cicd       = "GitHub Actions deploys (via Workload Identity Federation, no keys)"
  }
}

resource "google_service_account" "sa" {
  for_each     = local.service_accounts
  account_id   = "sa-${each.key}"
  display_name = each.value
}

# Project-level roles, kept to the minimum each service needs.
locals {
  project_roles = {
    # Firestore access for server-side code.
    functions = ["roles/datastore.user", "roles/cloudtasks.enqueuer", "roles/workflows.invoker"]
    workflows = ["roles/datastore.user", "roles/cloudtasks.enqueuer", "roles/run.invoker"]
    genkit    = ["roles/aiplatform.user", "roles/datastore.user"]
  }

  project_role_bindings = merge([
    for sa, roles in local.project_roles : {
      for r in roles : "${sa}-${r}" => { sa = sa, role = r }
    }
  ]...)

  # Per-bucket access.
  bucket_roles = {
    "functions-uploads"   = { sa = "functions", bucket = "uploads", role = "roles/storage.objectAdmin" }
    "functions-generated" = { sa = "functions", bucket = "generated", role = "roles/storage.objectAdmin" }
    "functions-print"     = { sa = "functions", bucket = "print", role = "roles/storage.objectAdmin" }
    "genkit-uploads"      = { sa = "genkit", bucket = "uploads", role = "roles/storage.objectViewer" }
    "genkit-generated"    = { sa = "genkit", bucket = "generated", role = "roles/storage.objectAdmin" }
    "facescore-uploads"   = { sa = "face-score", bucket = "uploads", role = "roles/storage.objectViewer" }
    "facescore-generated" = { sa = "face-score", bucket = "generated", role = "roles/storage.objectViewer" }
    "upscale-generated"   = { sa = "upscale", bucket = "generated", role = "roles/storage.objectAdmin" }
    "render-generated"    = { sa = "render", bucket = "generated", role = "roles/storage.objectViewer" }
    "render-print"        = { sa = "render", bucket = "print", role = "roles/storage.objectAdmin" }
  }
}

resource "google_project_iam_member" "project" {
  for_each = local.project_role_bindings
  project  = var.project_id
  role     = each.value.role
  member   = "serviceAccount:${google_service_account.sa[each.value.sa].email}"
}

resource "google_storage_bucket_iam_member" "bucket" {
  for_each = local.bucket_roles
  bucket   = google_storage_bucket.book[each.value.bucket].name
  role     = each.value.role
  member   = "serviceAccount:${google_service_account.sa[each.value.sa].email}"
}

# Secret access is granted per secret, added when each secret exists (owner creates them):
#   razorpay-*, stripe-*, smtp-uri, printer-api-key, admin-emails -> sa-functions only.
# CI deploy roles and Workload Identity Federation are added once the GitHub repository exists.
