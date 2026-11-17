import { CloudTasksClient } from "@google-cloud/tasks";

export interface QueueConfig {
  project: string;
  location: string;
  queue: string;
  workerUrl: string;
  /** Service account whose Google-signed token the queue attaches. It must be allowed to invoke the worker. */
  invokerServiceAccount: string;
}

/** Cloud Tasks queue for preview jobs. The task name carries the book id, so a book is never queued twice at once. */
export function previewQueue(cfg: QueueConfig, client = new CloudTasksClient()) {
  return {
    async enqueue(bookId: string): Promise<void> {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(bookId)) throw new Error("unexpected book id");
      try {
        await client.createTask({
          parent: client.queuePath(cfg.project, cfg.location, cfg.queue),
          task: {
            name: client.taskPath(cfg.project, cfg.location, cfg.queue, `preview-${bookId}`),
            dispatchDeadline: { seconds: 1800 },
            httpRequest: {
              httpMethod: "POST",
              url: `${cfg.workerUrl}/run`,
              headers: { "content-type": "application/json" },
              body: Buffer.from(JSON.stringify({ bookId })).toString("base64"),
              oidcToken: { serviceAccountEmail: cfg.invokerServiceAccount, audience: cfg.workerUrl },
            },
          },
        });
      } catch (e) {
        if ((e as { code?: number }).code === 6) return; // ALREADY_EXISTS: it is queued already
        throw e;
      }
    },
  };
}
