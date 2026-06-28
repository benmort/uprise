import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../auth/password.util";

/**
 * Upsert a local super-admin login (god-mode — no tenant membership required).
 * Credentials come from env (or argv) so none are committed to source:
 *   ADMIN_EMAIL=you@example.org ADMIN_PASSWORD=secret npm --prefix apps/api run seed:admin
 * Intended for local/dev only.
 */
async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? process.argv[2] ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? process.argv[3] ?? "";
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (or pass them as argv).");
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  try {
    const prisma = app.get(PrismaService);
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, isSuperAdmin: true, emailVerified: true, deletedAt: null },
      create: { email, displayName: "Admin", passwordHash, isSuperAdmin: true, emailVerified: true },
    });
    // eslint-disable-next-line no-console
    console.log(`Upserted super-admin ${user.email} (id=${user.id}, isSuperAdmin=${user.isSuperAdmin}).`);
  } finally {
    await app.close();
  }
}

void main();
