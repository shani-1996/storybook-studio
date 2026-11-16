terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Local state for the first apply (dev). Move to a GCS backend bucket before prod and before CI applies.
}

provider "google" {
  project = var.project_id
  region  = var.region
}
