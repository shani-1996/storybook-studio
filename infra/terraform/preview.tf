# Permissions for the preview worker (Cloud Run service `preview-worker`) and its queue, added for milestone 4.
# The worker runs as sa-genkit, which already has Vertex AI, Firestore, the uploads bucket (read) and the
# generated bucket (read/write) in iam.tf. Only the extra, narrow grants are listed here.
# The service itself is deployed with gcloud (container build), so it is referenced by name.

# Preview pages are written to the default Firebase bucket, where the owner's browser may read them (storage.rules).
resource "google_storage_bucket_iam_member" "worker_writes_previews" {
  bucket = "${var.project_id}.firebasestorage.app"
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.sa["genkit"].email}"
}

# The worker calls the private face-score service to compare faces.
resource "google_cloud_run_v2_service_iam_member" "worker_invokes_face_score" {
  project  = var.project_id
  location = var.region
  name     = "face-score"
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.sa["genkit"].email}"
}

# The queue calls the worker as sa-functions (the account that creates the task). Scoped to this one service.
resource "google_cloud_run_v2_service_iam_member" "queue_invokes_worker" {
  project  = var.project_id
  location = var.region
  name     = "preview-worker"
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.sa["functions"].email}"
}

# A task carries a Google-signed token for sa-functions, so the function must be allowed to act as that account
# (here, as itself). Granted on this one account only.
resource "google_service_account_iam_member" "functions_act_as_itself" {
  service_account_id = google_service_account.sa["functions"].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.sa["functions"].email}"
}
