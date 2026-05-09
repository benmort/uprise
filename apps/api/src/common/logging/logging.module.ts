import { Module } from "@nestjs/common";
import { DomainLogger } from "./domain-logger.service";

@Module({
  providers: [DomainLogger],
  exports: [DomainLogger],
})
export class LoggingModule {}
