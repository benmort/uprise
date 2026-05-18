import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(scriptDir, "..");
const sourceCandidates = [
  resolve(workerRoot, "../api/src/generated/prisma"),
  resolve(workerRoot, "../../apps/api/src/generated/prisma"),
];
const targetDir = resolve(workerRoot, "dist/api/src/generated/prisma");

const sourceDir = sourceCandidates.find((candidate) => existsSync(candidate));

if (!sourceDir) {
  console.error(
    `Missing Prisma generated client. Checked: ${sourceCandidates.join(", ")}. Run "pnpm --filter api prisma:generate" before starting worker.`,
  );
  process.exit(1);
}

mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
console.log(`Copied Prisma generated client to ${targetDir}`);
