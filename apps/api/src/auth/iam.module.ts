import { Module } from "@nestjs/common";
import { IamController } from "./iam.controller";
import { ProfileController } from "./profile.controller";
import { AuthFlowsController } from "./auth-flows.controller";
import { SessionService } from "./session.service";
import { ProfileService } from "./profile.service";
import { IamFlowsService } from "./iam-flows.service";
import { FlagsModule } from "../common/flags/flags.module";

/**
 * IAM session endpoints + SessionService, self-service profiles/avatars (doc 11),
 * and the full auth-flow surface — magic-link/reset/verify/2FA/invite/select-tenant
 * (doc 14). IamFlowsService is exported so AuthController (/auth/check) can read
 * memberships. FlagsModule supplies plan-limit enforcement on membership creation
 * (invite-accept + join-approval). The global auth guard resolves sessions via SessionService.
 */
@Module({
  imports: [FlagsModule],
  controllers: [IamController, ProfileController, AuthFlowsController],
  providers: [SessionService, ProfileService, IamFlowsService],
  exports: [SessionService, ProfileService, IamFlowsService],
})
export class IamModule {}
