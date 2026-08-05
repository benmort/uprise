import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { TelephonyProvisioningService } from "../telephony/telephony-provisioning.service";

/* eslint-disable no-console */

/**
 * Register an organisation's OWN Twilio account and all of its numbers as one interchangeable
 * sending pool, from the PRIVATE_TELEPHONY_* env vars.
 *
 *   npm --prefix apps/api run telephony:sync-private-pool
 *
 * Idempotent: numbers already registered are reported as held and left alone, so re-running
 * after the organisation buys another number picks up just the new one. Nothing is purchased
 * and no voice hook is ever claimed — see `syncPrivatePool` for why.
 *
 * Credentials come from the environment, never from argv: an auth token passed as an argument
 * would land in shell history and in the process list.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["warn", "error"] });
  try {
    const result = await app.get(TelephonyProvisioningService).syncPrivatePool();
    if (!result.configured) {
      console.log(
        "PRIVATE_TELEPHONY_* is not set (needs TENANT_SLUG + ACCOUNT_SID + AUTH_TOKEN) — nothing to sync.",
      );
      return;
    }
    console.log(`tenant ${result.tenantId} · account ${result.accountId}`);
    console.log(`adopted (${result.adopted.length}): ${result.adopted.join(", ") || "none"}`);
    console.log(`already held (${result.alreadyHeld.length}): ${result.alreadyHeld.join(", ") || "none"}`);
    for (const s of result.skipped) console.log(`skipped ${s.phoneNumberE164}: ${s.reason}`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
