import { redactedContextObject } from "./log-redaction";

export type LogEventRow = {
  service: string;
  domain: string;
  level: "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
  trace?: string;
  tenantId?: string;
};

/**
 * How rows reach storage. A function rather than the Prisma delegate itself, so this file imports
 * nothing from Prisma: the sink is attached to a `@Global` logger that must resolve before (and
 * without) a database, and a type-level dependency here is the first step towards a real one.
 */
export type LogEventWriter = (rows: LogEventRow[]) => Promise<unknown>;

/**
 * Buffered, fire-and-forget writer for `ops.LogEvent`.
 *
 * Three constraints drive the shape, and each has bitten a logging system somewhere:
 *
 * 1. **It must never throw.** This runs inside `DomainLogger.error`, i.e. while something has
 *    already gone wrong. A sink that raises would replace the real error with its own.
 * 2. **It must never block.** Nothing awaits `record()`. Rows accumulate in memory and flush on a
 *    timer, so an unreachable database slows nothing down.
 * 3. **It must be bounded.** If the database is down the buffer would grow without limit —
 *    precisely during the incident where memory matters most. At `MAX_BUFFER` the OLDEST rows are
 *    dropped and a counter records how many, because the newest errors are the ones being read.
 *
 * It is not an audit log and does not pretend to be: a crash loses whatever had not flushed. Rows
 * that must survive go in the outbox, in a transaction, which is a different mechanism for a
 * different promise.
 */
export class LogEventSink {
  private buffer: LogEventRow[] = [];
  private timer: NodeJS.Timeout | null = null;
  private dropped = 0;
  private writing = false;

  constructor(
    private readonly writer: LogEventWriter,
    private readonly service: string,
    private readonly opts: { flushMs?: number; maxBuffer?: number; batchSize?: number } = {},
  ) {}

  private get flushMs(): number {
    return this.opts.flushMs ?? 2_000;
  }

  private get maxBuffer(): number {
    return this.opts.maxBuffer ?? 500;
  }

  private get batchSize(): number {
    return this.opts.batchSize ?? 100;
  }

  /** Queue one row. Returns immediately; never throws. */
  record(row: Omit<LogEventRow, "service">): void {
    try {
      const context = redactedContextObject(row.context);
      this.buffer.push({
        ...row,
        service: this.service,
        context,
        // Denormalised so per-tenant filtering is an index lookup, not a JSON scan.
        tenantId: row.tenantId ?? (typeof context?.tenantId === "string" ? context.tenantId : undefined),
      });
      if (this.buffer.length > this.maxBuffer) {
        const overflow = this.buffer.length - this.maxBuffer;
        this.buffer.splice(0, overflow);
        this.dropped += overflow;
      }
      this.schedule();
    } catch {
      // A logging sink that throws is worse than one that misses a line.
    }
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushMs);
    // Never hold the process open for a log flush — a CLI or a test must still exit.
    this.timer.unref?.();
  }

  /** Write what is buffered. Safe to call concurrently; failures put rows back for the next go. */
  async flush(): Promise<void> {
    if (this.writing || this.buffer.length === 0) return;
    this.writing = true;
    const batch = this.buffer.splice(0, this.batchSize);
    if (this.dropped > 0) {
      // Say so in-band rather than silently under-reporting — a gap nobody knows about is worse
      // than a gap that announces itself.
      batch.unshift({
        service: this.service,
        domain: "observability",
        level: "warn",
        message: `Log sink dropped ${this.dropped} buffered rows (buffer full)`,
      });
      this.dropped = 0;
    }
    try {
      await this.writer(batch);
    } catch {
      // Put them back at the front, but only up to the cap, so a persistent outage cannot grow
      // the buffer without limit through repeated failed flushes.
      this.buffer = [...batch, ...this.buffer].slice(-this.maxBuffer);
    } finally {
      this.writing = false;
      if (this.buffer.length > 0) this.schedule();
    }
  }

  /** Test/shutdown seam. */
  get pending(): number {
    return this.buffer.length;
  }
}
