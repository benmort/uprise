import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { seedPlans } from "../shared-seed/plans.seed";

/**
 * Canonical plan seeder — provisions Grassroots/Starter/Growth/Scale. Non-clobbering, so it's
 * safe to run in any environment after `prisma migrate deploy`:
 *   npm --prefix apps/api run seed:plans
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const created = await seedPlans(app.get(PrismaService));
    // eslint-disable-next-line no-console
    console.log(created.length ? `Plans created: ${created.join(", ")}` : "All plans already exist.");
  } finally {
    await app.close();
  }
}

void main();
