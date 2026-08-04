// Builds the <uprise-action> loader: src/embed/loader.ts → public/embed/v1/uprise-action.js.
// The artifact is COMMITTED (dev servers and `next build` both serve it without
// this step); `pnpm --filter action build:embed` refreshes it after editing the
// source, and the vitest drift test fails when the two fall out of sync.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [path.join(root, "src/embed/loader.ts")],
  outfile: path.join(root, "public/embed/v1/uprise-action.js"),
  bundle: true,
  format: "iife",
  target: "es2019",
  minify: false, // readable artifact — embedders read what they run
  legalComments: "none",
});

console.log("built public/embed/v1/uprise-action.js"); // eslint-disable-line no-console
