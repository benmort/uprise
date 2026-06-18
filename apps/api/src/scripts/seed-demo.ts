import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SeedService } from "../shared-seed/seed.service";

/**
 * Demo-data seeder — the shared seed used by demo/screenshots (and sharing its
 * canonical definitions with the product tour + tests). Idempotent: safe to
 * re-run. Run after `prisma migrate deploy`:
 *   npm --prefix apps/api run seed:demo      # populate
 *   npm --prefix apps/api run seed:clear     # remove demo rows
 */
async function main(): Promise<void> {
  const clear = process.argv.includes("--clear");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const seed = app.get(SeedService);
    if (clear) {
      await seed.clearDemo();
      // eslint-disable-next-line no-console
      console.log("Demo data cleared.");
    } else {
      const result = await seed.seedDemo();
      // eslint-disable-next-line no-console
      console.log("Demo data seeded:\n" + JSON.stringify(result, null, 2));
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", error);
    process.exit(1);
  });
