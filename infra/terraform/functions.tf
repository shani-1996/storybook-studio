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

# Cloud Storage triggers check that the bucket exists before they are created. That check needs the
# bucket-level "look up this bucket" right (storage.buckets.get), which objectAdmin does not include.
# legacyBucketReader adds only that (plus listing object names) and only on the uploads bucket.
resource "google_storage_bucket_iam_member" "uploads_bucket_lookup" {
  for_each = {
    functions = "serviceAccount:${google_service_account.sa["functions"].email}"
    eventarc  = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-eventarc.iam.gserviceaccount.com"
  }
  bucket = google_storage_bucket.book["uploads"].name
  role   = "roles/storage.legacyBucketReader"
  member = each.value
}

# The storage trigger delivers events to the photo-check function's Cloud Run service as sa-functions, so that
# account must be allowed to call that one service. Scoped to this service only (the deploy tool would otherwise
# suggest project-wide run.invoker for the default compute account, which is much broader).
resource "google_cloud_run_v2_service_iam_member" "functions_invoke_photo_check" {
  project  = var.project_id
  location = var.region
  name     = "onphotouploaded"
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.sa["functions"].email}"
}

# Storage security rules read the book's owner and status from Firestore (firestore.get in storage.rules).
# Google's Storage service agent needs this role for that cross-service lookup. The Firebase CLI normally offers
# to grant it interactively; our deploys run without prompts, so it is granted here instead.
resource "google_project_iam_member" "storage_rules_read_firestore" {
  project = var.project_id
  role    = "roles/firebaserules.firestoreServiceAgent"
  member  = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-firebasestorage.iam.gserviceaccount.com"
}
