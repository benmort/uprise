import { Global, Module } from "@nestjs/common";
import { DomainLogger } from "./domain-logger.service";

/**
 * Global so every domain module (incl. the @Global Email/Payment/Calls modules)
 * can inject DomainLogger without importing this module. Boot-critical: those
 * modules assume "Logger is global" — without @Global the Nest container fails
 * to resolve EmailService's DomainLogger at startup.
 */
@Global()
@Module({
  providers: [DomainLogger],
  exports: [DomainLogger],
})
export class LoggingModule {}
