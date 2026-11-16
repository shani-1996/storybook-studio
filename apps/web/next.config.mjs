import path from "node:path";
import { fileURLToPath } from "node:url";

// apps/web is deployed on its own by Firebase App Hosting (own package-lock.json, own tsconfig).
// Pin the project root to this folder so Next.js never guesses it from a lock file elsewhere in the
// monorepo, and the build output (.next/standalone) keeps the layout the App Hosting adapter expects.
const appRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: appRoot,
  turbopack: { root: appRoot },
};

export default nextConfig;
