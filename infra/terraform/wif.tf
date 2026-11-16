# Workload Identity Federation for GitHub Actions: no long-lived keys in GitHub (spec section 10, rule 6).
# Only workflows from the named repository, running on the main branch, can act as sa-cicd.

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "OIDC identities from GitHub Actions workflows"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Required guard: tokens from any other repository or branch are rejected.
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "cicd_wif" {
  service_account_id = google_service_account.sa["cicd"].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# sa-cicd deploys security rules for now. Roles are added only as each deploy step is built.
resource "google_project_iam_member" "cicd" {
  for_each = toset([
    "roles/firebaserules.admin",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/firebase.viewer",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.sa["cicd"].email}"
}

output "wif_provider" {
  description = "Workload identity provider resource name for google-github-actions/auth."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "cicd_service_account" {
  value = google_service_account.sa["cicd"].email
}
