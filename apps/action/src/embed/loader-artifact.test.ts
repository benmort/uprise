import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSync } from "esbuild";

/**
 * The committed /embed/v1 artifact must match a fresh build of the loader
 * source — editing src/embed/loader.ts without running `build:embed` would
 * otherwise ship a stale widget to every external embedder.
 */
describe("embed loader artifact", () => {
  it("public/embed/v1/uprise-action.js is the current build of src/embed/loader.ts", () => {
    const root = path.resolve(__dirname, "../..");
    const committed = readFileSync(path.join(root, "public/embed/v1/uprise-action.js"), "utf8");
    const fresh = buildSync({
      entryPoints: [path.join(root, "src/embed/loader.ts")],
      write: false,
      bundle: true,
      format: "iife",
      target: "es2019",
      minify: false,
      legalComments: "none",
    });
    expect(committed).toBe(Buffer.from(fresh.outputFiles[0]!.contents).toString("utf8"));
  });
});
