import { Module } from "@nestjs/common";
import { IamController } from "./iam.controller";
import { ProfileController } from "./profile.controller";
import { SessionService } from "./session.service";
import { ProfileService } from "./profile.service";

/**
 * IAM session endpoints + SessionService, plus self-service user profiles +
 * avatars (meld doc 11). Exported so the global auth guard can resolve sessions
 * (PrismaService + ConfigService are global).
 */
@Module({
  controllers: [IamController, ProfileController],
  providers: [SessionService, ProfileService],
  exports: [SessionService, ProfileService],
})
export class IamModule {}
