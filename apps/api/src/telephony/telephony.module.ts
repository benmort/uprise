import { Global, Module } from "@nestjs/common";
import { FlagsModule } from "../common/flags/flags.module";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { TelephonySenderResolver } from "./telephony-sender.resolver";
import { TelephonyWebhookAuthService } from "./telephony-webhook-auth.service";
import { VoiceAccountResolver } from "./voice-account.resolver";
import { TwilioProvisioningClient } from "./twilio-provisioning.client";
import { TelephonyProvisioningService } from "./telephony-provisioning.service";
import { TelephonyProvisioningController } from "./telephony-provisioning.controller";

/**
 * Per-tenant telephony: Twilio subaccounts, AU number provisioning and the
 * sender-resolution seam. Global because the resolver sits on every send path
 * (transactional 2FA, blasts, inbox replies) and the provisioning service is
 * consumed by the ReactionsModule factory + the webhooks controller.
 */
@Global()
@Module({
  imports: [FlagsModule],
  controllers: [TelephonyProvisioningController],
  providers: [
    TelephonySenderResolver,
    TelephonyWebhookAuthService,
    VoiceAccountResolver,
    TwilioProvisioningClient,
    TelephonyProvisioningService,
    CredentialCryptoService,
  ],
  exports: [
    TelephonySenderResolver,
    TelephonyWebhookAuthService,
    VoiceAccountResolver,
    TelephonyProvisioningService,
  ],
})
export class TelephonyModule {}
