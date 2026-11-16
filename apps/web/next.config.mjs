import path from "node:path";
import { fileURLToPath } from "node:url";

// The repo is a monorepo (apps/web lives two folders below the root). Pin the root explicitly so
// Next.js never guesses from a stray lock file elsewhere, locally or in the App Hosting build.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
