import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { assertCopyApproved } from "@gycb/shared";
import { PageTemplate } from "../../genkit-flows/src/schemas.js";
import type { StoryContent, StoryCopy } from "../../genkit-flows/src/preview/ports.js";

/**
 * Loads the story from the content folder. Copy that the owner has not approved is refused unless the
 * environment explicitly allows draft copy (dev only).
 */
export async function loadContent(dir: string, allowDraftCopy: boolean): Promise<StoryContent> {
  const copy = JSON.parse(await readFile(join(dir, "copy.en.json"), "utf8")) as StoryCopy;
  if (!allowDraftCopy) assertCopyApproved(copy);
  const templates: StoryContent["templates"] = {};
  for (const f of await readdir(join(dir, "templates"))) {
    if (!f.endsWith(".json")) continue;
    const t = PageTemplate.parse(JSON.parse(await readFile(join(dir, "templates", f), "utf8")));
    templates[t.id] = t;
  }
  return { templates, copy };
}
