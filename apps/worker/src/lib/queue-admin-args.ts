import { QUEUE_NAMES } from "../../../api/src/common/queue/queue.constants";

/** The subcommands the queue-admin CLI (`src/admin/queue-admin.ts`) accepts. */
export type QueueAdminCommand = "inspect-failed" | "replay-failed" | "drain";

export const QUEUE_ADMIN_COMMANDS: readonly QueueAdminCommand[] = [
  "inspect-failed",
  "replay-failed",
  "drain",
];

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** True when `value` is one of the known BullMQ queue names. */
export function isQueueName(value: string): value is QueueName {
  return Object.values(QUEUE_NAMES).includes(value as QueueName);
}

/**
 * Parse the queue-admin CLI argv into a validated `{ command, queueName }`.
 * Mirrors `process.argv` positions: argv[2] is the command, argv[3] the queue
 * (defaulting to `blast-send`). Throws with an actionable message when either
 * is missing or unknown so the CLI fails loudly rather than acting on garbage.
 */
export function parseArgs(argv: string[]): { command: QueueAdminCommand; queueName: QueueName } {
  const command = (argv[2] || "").trim() as QueueAdminCommand;
  const queueName = (argv[3] || QUEUE_NAMES.BLAST_SEND).trim();
  if (!QUEUE_ADMIN_COMMANDS.includes(command)) {
    throw new Error(
      "Command must be one of: inspect-failed, replay-failed, drain. Example: pnpm --filter worker queue:inspect-failed blast-send",
    );
  }
  if (!isQueueName(queueName)) {
    throw new Error(
      `Unknown queue "${queueName}". Valid values: ${Object.values(QUEUE_NAMES).join(", ")}`,
    );
  }
  return { command, queueName };
}
