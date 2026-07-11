import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { StateMpSyncService } from "../../civic/state-mp-sync.service";

/**
 * Backfill / refresh state & territory MPs from Wikidata into the `civic` schema. Idempotent —
 * safe to re-run. No API key (Wikidata is open). Run: `pnpm --filter api civic:sync-states`.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  try {
    const summary = await app.get(StateMpSyncService).run();
    // eslint-disable-next-line no-console
    console.log("civic:sync-states done —", JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("civic:sync-states failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
