import { Injectable, Logger } from "@nestjs/common";
import type { LogEventSink } from "./log-event.sink";

@Injectable()
export class DomainLogger {
  private readonly root = new Logger("UpriseApi");

  /**
   * Durable sink for warn/error, attached at bootstrap rather than injected.
   *
   * It CANNOT be a constructor dependency. `LoggingModule` is `@Global` precisely because every
   * domain module assumes DomainLogger resolves without importing anything, and PrismaService's
   * own module sits below it; making the logger depend on Prisma inverts that and the Nest
   * container fails to resolve at startup. A setter keeps the dependency one-way and leaves the
   * logger fully usable before — or entirely without — a database.
   *
   * See `attachLogEventSink` in bootstrap.ts, and `app.module.boot.spec.ts`, which is the only
   * check that catches this class of mistake.
   */
  private sink: LogEventSink | null = null;

  setSink(sink: LogEventSink | null): void {
    this.sink = sink;
  }

  debug(domain: string, message: string, context?: Record<string, unknown>): void {
    this.root.debug(this.format(domain, message, context));
  }

  log(domain: string, message: string, context?: Record<string, unknown>): void {
    this.root.log(this.format(domain, message, context));
  }

  warn(domain: string, message: string, context?: Record<string, unknown>): void {
    this.root.warn(this.format(domain, message, context));
    this.sink?.record({ domain, level: "warn", message, context });
  }

  error(
    domain: string,
    message: string,
    trace?: string,
    context?: Record<string, unknown>,
  ): void {
    this.root.error(this.format(domain, message, context), trace);
    this.sink?.record({ domain, level: "error", message, context, trace });
  }

  private format(domain: string, message: string, context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return `[${domain}] ${message}`;
    }
    return `[${domain}] ${message} ${JSON.stringify(context)}`;
  }
}
