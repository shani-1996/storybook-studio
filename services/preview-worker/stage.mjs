// Assembles a small, self-contained folder for the container build (Cloud Build uploads only this folder):
//   image/dist/server.mjs   the bundled worker (run `pnpm build` first)
//   image/fonts/            the open-licence fonts the renderer needs
//   image/content/          the story (copy and page templates)
//   image/package.json      only the packages that cannot be bundled
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = here("./image/");
if (!existsSync(here("./dist/server.mjs"))) throw new Error("Run `pnpm build` first.");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(here("./dist"), out + "dist", { recursive: true });
cpSync(here("../render/fonts"), out + "fonts", { recursive: true });
cpSync(here("../../content/stories"), out + "content/stories", { recursive: true });
cpSync(here("./Dockerfile"), out + "Dockerfile");

const pkg = JSON.parse(readFileSync(here("./package.json"), "utf8"));
const render = JSON.parse(readFileSync(here("../render/package.json"), "utf8"));
writeFileSync(
  out + "package.json",
  JSON.stringify(
    {
      name: "preview-worker-image",
      private: true,
      type: "module",
      dependencies: {
        "firebase-admin": pkg.dependencies["firebase-admin"],
        sharp: pkg.dependencies.sharp,
        "puppeteer-core": render.dependencies["puppeteer-core"],
      },
    },
    null,
    2,
  ),
);
console.log("staged in", out);
