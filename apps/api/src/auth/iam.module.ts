import { Module } from "@nestjs/common";
import { IamController } from "./iam.controller";
import { SessionService } from "./session.service";

/**
 * IAM session endpoints + SessionService. Exported so the global auth guard can
 * resolve sessions (PrismaService + ConfigService are global).
 */
@Module({
  controllers: [IamController],
  providers: [SessionService],
  exports: [SessionService],
})
export class IamModule {}
