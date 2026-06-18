import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { ContactsBackfillService } from "../contacts/contacts-backfill.service";
import { EngagementService } from "../shared-engagement/engagement.service";

/**
 * One-off Phase-1 cutover runner. Run AFTER `prisma migrate deploy`:
 *   npm --prefix apps/api run backfill:contacts
 *
 * - Seeds the system-default disposition taxonomy (idempotent).
 * - Backfills the Contact spine from the existing AudienceContact / message /
 *   conversation rows, then links their contactId FKs. Idempotent + resumable —
 *   safe to re-run.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    await app.get(EngagementService).ensureDefaultDispositions();
    // eslint-disable-next-line no-console
    console.log("Seeded default disposition taxonomy.");

    const result = await app.get(ContactsBackfillService).backfillAll();
    // eslint-disable-next-line no-console
    console.log(`Contact backfill complete: ${result.totalProcessed} rows over ${result.batches} batches.`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Backfill failed:", error);
    process.exit(1);
  });
