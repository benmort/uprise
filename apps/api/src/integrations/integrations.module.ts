import { Module } from "@nestjs/common";
import { LoggingModule } from "../common/logging/logging.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { CredentialCryptoService } from "./credential-crypto.service";
import { ActionNetworkConnector } from "./action-network.connector";
import { InternalSourceConnector } from "./internal-source.connector";
import { NationBuilderConnector } from "./nation-builder.connector";
import { NationBuilderClient } from "./nation-builder.client";
import { NationBuilderWriteConnector } from "./nation-builder-write.connector";
import { CrmPushService } from "./crm-push.service";
import { QueueModule } from "../common/queue/queue.module";
import { ContactsModule } from "../contacts/contacts.module";
// TagsModule supplies CONTACT_TAG_PORT so an NB import can mirror person tags onto
// contact tags (source "nation_builder"). ConsentService arrives via the @Global()
// MessagingModule — no import needed for it.
import { TagsModule } from "../tags/tags.module";
// FlagsModule supplies FeatureFlagsService — the push pipeline's global kill switch.
import { FlagsModule } from "../common/flags/flags.module";

@Module({
  imports: [LoggingModule, QueueModule, ContactsModule, TagsModule, FlagsModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    CredentialCryptoService,
    ActionNetworkConnector,
    InternalSourceConnector,
    NationBuilderConnector,
    NationBuilderClient,
    NationBuilderWriteConnector,
    CrmPushService,
  ],
  // CrmPushService is consumed by the reactions module (records deliveries) and the
  // worker (processes them).
  exports: [IntegrationsService, CrmPushService],
})
export class IntegrationsModule {}
