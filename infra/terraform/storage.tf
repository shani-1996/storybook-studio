# Three private buckets with automatic deletion (spec section 5).
# Lifecycle clocks use the object's customTime, which the app sets to the book's deleteAfter date
# (for example 30 days after delivery). A hard age cap applies as a safety net.
# The default Firebase bucket (<project>.firebasestorage.app) is managed by Firebase, not here.

locals {
  buckets = {
    uploads = {
      # Source photos: deleted 30 days after customTime (deleteAfter), hard max 120 days.
      days_since_custom_time = 30
      hard_max_age_days      = 120
    }
    generated = {
      # Generated images: deleted 180 days after delivery. Rejected candidates are deleted by the workflow at once.
      days_since_custom_time = 180
      hard_max_age_days      = 400
    }
    print = {
      # Print PDFs: deleted 90 days after delivery. Previews are deleted with the book.
      days_since_custom_time = 90
      hard_max_age_days      = 400
    }
  }
}

resource "google_storage_bucket" "book" {
  for_each = local.buckets

  name                        = "${var.project_id}-${each.key}"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  lifecycle_rule {
    condition {
      days_since_custom_time = each.value.days_since_custom_time
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = each.value.hard_max_age_days
    }
    action {
      type = "Delete"
    }
  }
}
