import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class DomainLogger {
  private readonly root = new Logger("YarnsApi");

  debug(domain: string, message: string, context?: Record<string, unknown>): void {
    this.root.debug(this.format(domain, message, context));
  }

  log(domain: string, message: string, context?: Record<string, unknown>): void {
    this.root.log(this.format(domain, message, context));
  }

  warn(domain: string, message: string, context?: Record<string, unknown>): void {
    this.root.warn(this.format(domain, message, context));
  }

  error(
    domain: string,
    message: string,
    trace?: string,
    context?: Record<string, unknown>,
  ): void {
    this.root.error(this.format(domain, message, context), trace);
  }

  private format(domain: string, message: string, context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return `[${domain}] ${message}`;
    }
    return `[${domain}] ${message} ${JSON.stringify(context)}`;
  }
}
