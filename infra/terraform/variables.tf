variable "project_id" {
  description = "GCP project ID (dev: book-dev-env)."
  type        = string
}

variable "region" {
  description = "Region for all resources (spec: asia-south1)."
  type        = string
  default     = "asia-south1"
}

variable "page_gen_max_concurrent" {
  description = "Global max concurrent page-generation tasks. Set from the Vertex AI image-model quota."
  type        = number
  default     = 4
}

variable "page_gen_max_dispatches_per_second" {
  description = "Global dispatch rate for page-generation tasks. Set from the Vertex AI image-model quota."
  type        = number
  default     = 1
}

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to deploy through Workload Identity Federation."
  type        = string
  default     = "shani-1996/storybook-studio"
}
