# Permissions for the Cloud Functions runtime account (sa-functions), added for milestone 3.
# Storage, Firestore, Tasks and Workflows roles are already in iam.tf.

# Receive Cloud Storage events (the photo-check trigger) and call Google APIs (Cloud Vision) on the project's quota.
resource "google_project_iam_member" "functions_runtime" {
  for_each = toset([
    "roles/eventarc.eventReceiver",
    "roles/serviceusage.serviceUsageConsumer",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.sa["functions"].email}"
}

# The IP hashing key. The secret itself is created outside Terraform (its value never appears in code or state).
resource "google_secret_manager_secret_iam_member" "functions_ip_pepper" {
  secret_id = "IP_HASH_PEPPER"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa["functions"].email}"
}

# Only sa-functions may call the private face-score service. The service is deployed with gcloud (container build),
# so it is referenced by name here.
resource "google_cloud_run_v2_service_iam_member" "functions_invoke_face_score" {
  project  = var.project_id
  location = var.region
  name     = "face-score"
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.sa["functions"].email}"
}
