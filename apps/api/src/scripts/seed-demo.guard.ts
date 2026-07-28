/**
 * Guard for the destructive half of the demo seeder.
 *
 * `clearDemo()` deletes by natural key — contacts by ADDRESS, and campaigns, turfs, surveys,
 * scripts and journeys by exact NAME. Against a production database a real row that happens to
 * collide with a fixture value would be destroyed, and there is no undo. So `--clear` refuses to
 * run anywhere that looks like production unless the operator also passes `--force`.
 *
 * `seedDemo()` is deliberately NOT guarded: it is additive and idempotent.
 *
 * Pure functions, no Nest and no I/O, so the decision is unit-testable without booting the app.
 */

/**
 * Just the two vars the decision needs. Indexed so `process.env` (whose values are
 * `string | undefined` across an open index) satisfies it directly.
 */
export type SeedEnv = { NODE_ENV?: string; DATABASE_URL?: string; [key: string]: string | undefined };

/** Hosts that are unambiguously a developer's own machine. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

/** The database host in a connection URL, or null when it can't be parsed. */
export function databaseHost(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).hostname || null;
  } catch {
    return null;
  }
}

/**
 * True when the target looks like production. Deliberately fail-safe: an unparseable or missing
 * DATABASE_URL counts as production, because "I couldn't tell" must not authorise a destructive
 * delete. Only a recognised local host, with NODE_ENV not set to production, is treated as safe.
 */
export function looksLikeProduction(env: SeedEnv): boolean {
  if (env.NODE_ENV === "production") return true;
  const host = databaseHost(env.DATABASE_URL);
  if (!host) return true;
  return !LOCAL_HOSTS.has(host);
}

export type SeedAction =
  | { action: "seed" }
  | { action: "clear" }
  | { action: "refuse"; reason: string };

/** Resolve argv + env into what the script should actually do. */
export function resolveSeedAction(argv: string[], env: SeedEnv): SeedAction {
  if (!argv.includes("--clear")) return { action: "seed" };
  if (!looksLikeProduction(env)) return { action: "clear" };
  if (argv.includes("--force")) return { action: "clear" };
  const host = databaseHost(env.DATABASE_URL) ?? "unknown";
  return {
    action: "refuse",
    reason:
      `Refusing to clear demo data: "${host}" does not look like a local database.\n` +
      "clearDemo() deletes contacts by address and campaigns/turfs/surveys by exact name, so a " +
      "colliding production row would be destroyed.\n" +
      "Re-run with --force if you are certain.",
  };
}
