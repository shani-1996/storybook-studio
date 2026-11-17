// Bundles the worker (and the workspace packages it uses) into one file for the container.
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/server.mjs",
  // Native or large packages stay as normal dependencies installed in the image.
  external: ["firebase-admin", "sharp", "puppeteer-core"],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
