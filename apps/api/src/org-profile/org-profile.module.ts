import { Module } from "@nestjs/common";
import { OrgProfileController } from "./org-profile.controller";
import { OrgProfileService } from "./org-profile.service";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";

/** Org legal/operational record (meld doc 11). CredentialCryptoService (TFN
 *  encryption) is provided locally — it only needs ConfigService (global).
 *  Prisma/Outbox/Config are global. */
@Module({
  controllers: [OrgProfileController],
  providers: [OrgProfileService, CredentialCryptoService],
  exports: [OrgProfileService],
})
export class OrgProfileModule {}
