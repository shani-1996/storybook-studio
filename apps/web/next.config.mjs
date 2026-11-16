import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// apps/web is deployed on its own by Firebase App Hosting, which installs with npm into this folder
// (own package-lock.json). There, the project root must be this folder so the standalone build output
// has the layout the App Hosting adapter expects.
// Locally the monorepo uses pnpm, which keeps packages in the repository root and links them here,
// so the root must be the repository root. Detect which case we are in by where `next` really lives.
const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appRoot, "..", "..");

const nextPackage = fs.realpathSync(createRequire(import.meta.url).resolve("next/package.json"));
const nextIsInsideApp = path.relative(appRoot, nextPackage).split(path.sep)[0] !== "..";
const root = nextIsInsideApp ? appRoot : repoRoot;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: root,
  turbopack: { root },
};

export default nextConfig;
