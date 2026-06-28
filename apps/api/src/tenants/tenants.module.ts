import { Module } from "@nestjs/common";
import { TenantsController } from "./tenants.controller";
import { RegistrationController } from "./registration.controller";
import { NetworksController } from "./networks.controller";
import { TenantsService } from "./tenants.service";
import { RegistrationService } from "./registration.service";
import { IamModule } from "../auth/iam.module";
import { FlagsModule } from "../common/flags/flags.module";

/**
 * Tenant provisioning + membership/invitations + self-service sign-up + network creation
 * (meld doc 12 / prog tenant+identity onboarding). Imports IamModule for SessionService
 * (registration issues a session) and FlagsModule for plan-limit enforcement on new
 * members. Prisma/Outbox/Config are global.
 */
@Module({
  imports: [IamModule, FlagsModule],
  controllers: [TenantsController, RegistrationController, NetworksController],
  providers: [TenantsService, RegistrationService],
  exports: [TenantsService],
})
export class TenantsModule {}
