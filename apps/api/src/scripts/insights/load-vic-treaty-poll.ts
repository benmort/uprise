import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve, basename } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { AppModule } from "../../app.module";
import { InsightsIngestService, type KeyFinding } from "../../insights/insights-ingest.service";

/**
 * Load the YouGov "Common Threads" Victorian Treaty poll into the `insights`
 * schema. The crosstab xlsx (licensed — gitignored under data/insights/) is
 * provided by the operator; the curated key-findings JSON is committed.
 *   npm --prefix apps/api run insights:load-vic-treaty-poll [xlsxPath] [findingsPath]
 * See docs/insights/vic-treaty-poll-2026.md.
 */
const ROOT = resolve(__dirname, "../../../../..");
const DEFAULT_XLSX = resolve(ROOT, "data/insights/common-threads/CommonThreads_VICPoll_Jun26_Tables_09JUL26V2.xlsx");
const DEFAULT_FINDINGS = resolve(ROOT, "data/insights/common-threads/vic-treaty-key-findings.json");

async function main(): Promise<void> {
  const xlsxPath = process.argv[2] ?? DEFAULT_XLSX;
  const findingsPath = process.argv[3] ?? DEFAULT_FINDINGS;
  if (!existsSync(xlsxPath)) {
    console.error(`xlsx not found: ${xlsxPath}`); // eslint-disable-line no-console
    process.exit(1);
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx");
  const buf = readFileSync(xlsxPath);
  const workbook = XLSX.read(buf, { type: "buffer" });
  const sourceFileHash = createHash("sha256").update(buf).digest("hex");
  const keyFindings: KeyFinding[] = existsSync(findingsPath)
    ? (JSON.parse(readFileSync(findingsPath, "utf8")) as KeyFinding[])
    : [];

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const svc = app.get(InsightsIngestService);
    const res = await svc.ingestVicTreatyPoll({
      workbook,
      keyFindings,
      sourceFileName: basename(xlsxPath),
      sourceFileHash,
    });
    // eslint-disable-next-line no-console
    console.log(`  ✓ poll ${res.pollId}: ${res.questionCount} questions, ${res.estimateCount} estimates`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("insights:load-vic-treaty-poll failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
