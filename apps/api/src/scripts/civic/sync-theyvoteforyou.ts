import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { CivicSyncService } from "../../civic/civic-sync.service";

/**
 * Backfill / refresh the `civic` schema from They Vote For You. Idempotent — safe to re-run.
 * Requires THEYVOTEFORYOU_API_KEY in the environment. Run: `pnpm --filter api civic:sync`.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  try {
    const summary = await app.get(CivicSyncService).run();
    // eslint-disable-next-line no-console
    console.log("civic:sync done —", JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("civic:sync failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
