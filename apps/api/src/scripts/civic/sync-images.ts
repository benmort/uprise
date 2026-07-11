import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PoliticianImageSyncService } from "../../civic/politician-image-sync.service";

/**
 * Mirror politician headshots from Wikimedia Commons (Wikidata P18) into our Blob store, filling
 * `Politician.imageUrl`. Idempotent — an unchanged source photo is skipped; pass `--force` to
 * re-fetch every one. Needs BLOB_READ_WRITE_TOKEN. Run: `pnpm --filter api civic:images`.
 *
 * Run the roster syncs first (`civic:sync`, `civic:sync-states`) — this joins to those rows.
 */
async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  try {
    const summary = await app.get(PoliticianImageSyncService).run({ force });
    // eslint-disable-next-line no-console
    console.log("civic:images done —", JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("civic:images failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
