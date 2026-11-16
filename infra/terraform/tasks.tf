# Image repository for the Cloud Run services (genkit, face-score, upscale, render).
resource "google_artifact_registry_repository" "services" {
  location      = var.region
  repository_id = "services"
  format        = "DOCKER"
  description   = "Container images for Cloud Run services"
}

# Page generation queue: rate is set from the Vertex AI quota; retries follow spec section 6
# (min 10 s, max 10 min, 6 attempts) so a 429 backs off instead of failing the book.
resource "google_cloud_tasks_queue" "page_gen" {
  name     = "page-gen"
  location = var.region

  rate_limits {
    max_concurrent_dispatches = var.page_gen_max_concurrent
    max_dispatches_per_second = var.page_gen_max_dispatches_per_second
  }

  retry_config {
    max_attempts  = 6
    min_backoff   = "10s"
    max_backoff   = "600s"
    max_doublings = 5
  }
}
