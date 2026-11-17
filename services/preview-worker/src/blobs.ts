import { getStorage } from "firebase-admin/storage";
import type { PreviewBlobs } from "../../genkit-flows/src/preview/ports.js";

export interface Buckets {
  uploads: string;
  generated: string;
  preview: string;
}

export function gcsPreviewBlobs(b: Buckets): PreviewBlobs {
  const file = (bucket: string, path: string) => getStorage().bucket(bucket).file(path);
  return {
    async readPhoto(path) {
      const [data] = await file(b.uploads, path).download();
      return data;
    },
    async putGenerated(path, data, contentType) {
      await file(b.generated, path).save(data, { contentType, resumable: false });
    },
    async getGenerated(path) {
      const [data] = await file(b.generated, path).download();
      return data;
    },
    async removeGenerated(path) {
      await file(b.generated, path).delete({ ignoreNotFound: true });
    },
    async putPreview(path, data) {
      await file(b.preview, path).save(data, { contentType: "image/webp", resumable: false, metadata: { cacheControl: "private, max-age=300" } });
    },
  };
}
