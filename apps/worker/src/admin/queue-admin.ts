import "reflect-metadata";
import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";
import { Queue } from "bullmq";
import { QUEUE_NAMES } from "../../../api/src/common/queue/queue.constants";
import { QueueConfigService } from "../../../api/src/common/queue/queue-config.service";
import { ConfigService } from "@nestjs/config";

dotenvConfig({ path: resolve(process.cwd(), "../api/.env") });
dotenvConfig();

type Command = "inspect-failed" | "replay-failed" | "drain";

function isQueueName(value: string): value is (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES] {
  return Object.values(QUEUE_NAMES).includes(value as (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]);
}

function parseArgs(argv: string[]): { command: Command; queueName: string } {
  const command = (argv[2] || "").trim() as Command;
  const queueName = (argv[3] || QUEUE_NAMES.BLAST_SEND).trim();
  if (!["inspect-failed", "replay-failed", "drain"].includes(command)) {
    throw new Error(
      "Command must be one of: inspect-failed, replay-failed, drain. Example: pnpm --filter worker queue:inspect-failed blast-send",
    );
  }
  if (!isQueueName(queueName)) {
    throw new Error(`Unknown queue "${queueName}". Valid values: ${Object.values(QUEUE_NAMES).join(", ")}`);
  }
  return { command, queueName };
}

async function run(): Promise<void> {
  const { command, queueName } = parseArgs(process.argv);
  const queueConfig = new QueueConfigService(new ConfigService(process.env));
  const queue = new Queue(queueName, {
    connection: queueConfig.queueConnection,
    prefix: queueConfig.queuePrefix,
  });

  if (command === "inspect-failed") {
    const failed = await queue.getJobs(["failed"], 0, 50, true);
    console.log(
      JSON.stringify(
        failed.map((job) => ({
          id: job.id,
          name: job.name,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        })),
        null,
        2,
      ),
    );
    await queue.close();
    return;
  }

  if (command === "replay-failed") {
    const failed = await queue.getJobs(["failed"], 0, 100, true);
    for (const job of failed) {
      await job.retry();
    }
    console.log(`Retried ${failed.length} failed jobs on ${queueName}.`);
    await queue.close();
    return;
  }

  await queue.drain(true);
  await queue.clean(0, 1000, "completed");
  await queue.clean(0, 1000, "failed");
  console.log(`Drained queue ${queueName}.`);
  await queue.close();
}

void run();
