/** Dev values (not secrets). Another environment sets these variables. */
export const config = {
  projectId: process.env["GCLOUD_PROJECT"] ?? process.env["GOOGLE_CLOUD_PROJECT"] ?? "book-dev-env",
  uploadsBucket: process.env["UPLOADS_BUCKET"] ?? "book-dev-env-uploads",
  generatedBucket: process.env["GENERATED_BUCKET"] ?? "book-dev-env-generated",
  /** The default Firebase bucket: preview pages live here so the owner's browser can read them (storage rules). */
  previewBucket: process.env["PREVIEW_BUCKET"] ?? "book-dev-env.firebasestorage.app",
  faceScoreUrl: process.env["FACE_SCORE_URL"] ?? "https://face-score-420016114828.asia-south1.run.app",
  contentDir: process.env["CONTENT_DIR"] ?? "content/stories/when-i-grow-up",
  /** Vertex location for the image models ("global" for the Gemini 3 image models). */
  vertexLocation: process.env["VERTEX_LOCATION"] ?? "global",
  imageModel: process.env["IMAGE_MODEL"] ?? "gemini-3-pro-image",
  judgeModel: process.env["JUDGE_MODEL"] ?? "gemini-3-flash-preview",
  /** Draft story copy may only be shown in dev, never to customers. */
  allowDraftCopy: process.env["ALLOW_DRAFT_COPY"] === "true",
};
