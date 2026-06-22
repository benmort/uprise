import { Module } from "@nestjs/common";
import { LoggingModule } from "../common/logging/logging.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { CredentialCryptoService } from "./credential-crypto.service";
import { ActionNetworkConnector } from "./action-network.connector";
import { InternalSourceConnector } from "./internal-source.connector";
import { QueueModule } from "../common/queue/queue.module";
import { ContactsModule } from "../contacts/contacts.module";

@Module({
  imports: [LoggingModule, QueueModule, ContactsModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    CredentialCryptoService,
    ActionNetworkConnector,
    InternalSourceConnector,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
