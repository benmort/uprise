import { describe, expect, it } from "vitest";
import { QUEUE_NAMES } from "../../../api/src/common/queue/queue.constants";
import {
  QUEUE_ADMIN_COMMANDS,
  isQueueName,
  parseArgs,
} from "./queue-admin-args";

describe("isQueueName", () => {
  it("accepts every known BullMQ queue name", () => {
    for (const name of Object.values(QUEUE_NAMES)) {
      expect(isQueueName(name)).toBe(true);
    }
  });

  it("rejects unknown or malformed names", () => {
    expect(isQueueName("not-a-queue")).toBe(false);
    expect(isQueueName("")).toBe(false);
    expect(isQueueName("BLAST_SEND")).toBe(false); // enum key, not the wire value
    expect(isQueueName("blast-send ")).toBe(false); // untrimmed
  });
});

describe("parseArgs", () => {
  // Simulate process.argv: [node, script, command, queue]
  const argv = (command?: string, queue?: string): string[] => {
    const base = ["node", "queue-admin.ts"];
    if (command !== undefined) base.push(command);
    if (queue !== undefined) base.push(queue);
    return base;
  };

  it("parses an explicit command + queue", () => {
    expect(parseArgs(argv("inspect-failed", "journey-run"))).toEqual({
      command: "inspect-failed",
      queueName: "journey-run",
    });
  });

  it("defaults the queue to blast-send when omitted", () => {
    expect(parseArgs(argv("drain"))).toEqual({
      command: "drain",
      queueName: QUEUE_NAMES.BLAST_SEND,
    });
    expect(QUEUE_NAMES.BLAST_SEND).toBe("blast-send");
  });

  it("accepts each supported command", () => {
    for (const command of QUEUE_ADMIN_COMMANDS) {
      expect(parseArgs(argv(command, "domain-events")).command).toBe(command);
    }
  });

  it("trims surrounding whitespace on both positions", () => {
    expect(parseArgs(argv("  replay-failed  ", "  turf-estimate  "))).toEqual({
      command: "replay-failed",
      queueName: "turf-estimate",
    });
  });

  it("throws with a usage hint when the command is missing", () => {
    expect(() => parseArgs(argv())).toThrow(
      /Command must be one of: inspect-failed, replay-failed, drain/,
    );
  });

  it("throws when the command is not recognised", () => {
    expect(() => parseArgs(argv("nuke", "blast-send"))).toThrow(
      /Command must be one of/,
    );
  });

  it("throws and lists valid queues when the queue is unknown", () => {
    let caught: unknown;
    try {
      parseArgs(argv("drain", "made-up-queue"));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain('Unknown queue "made-up-queue"');
    // The error enumerates every real queue so the operator can pick one.
    for (const name of Object.values(QUEUE_NAMES)) {
      expect(message).toContain(name);
    }
  });
});
