import { Global, Module } from "@nestjs/common";
import { ErrorLogService } from "./error-log.service";
import { ErrorsController } from "./errors.controller";

/**
 * Global, mirroring LoggingModule: anything anywhere may need to record an error, and
 * the global exception filter resolves ErrorLogService straight off the app container
 * in bootstrap rather than through a module import.
 */
@Global()
@Module({
  controllers: [ErrorsController],
  providers: [ErrorLogService],
  exports: [ErrorLogService],
})
export class ErrorsModule {}
