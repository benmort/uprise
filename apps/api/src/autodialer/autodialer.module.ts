import { Module } from "@nestjs/common";
import { AutodialerController, AutodialerOpsController } from "./autodialer.controller";
import { AutodialerService } from "./autodialer.service";
import { DialerCallPlacerService } from "./dialer-call-placer.service";
import { DialerDispatchService } from "./dialer-dispatch.service";
import { DialerReportingService } from "./dialer-reporting.service";
import { ElectoralLookupService } from "./electoral-lookup.service";
import { DialerIvrController } from "./dialer-ivr.controller";
import { IvrFlowService } from "./ivr-flow.service";
import { SessionProgressService } from "./session-progress.service";
import { AudiencesModule } from "../audiences/audiences.module";
import { FlagsModule } from "../common/flags/flags.module";
import { QueueModule } from "../common/queue/queue.module";
import { TelephonyModule } from "../telephony/telephony.module";
import { MessagingModule } from "../messaging/messaging.module";

/**
 * The autodialer domain — voice broadcast / robo-poll / transfer campaigns.
 * Phase 2 scope: campaign CRUD + lifecycle. The dial engine, IVR webhook
 * surface and public widget session API land as later slices of this module.
 * Prisma/Outbox are global; FlagsModule is not, hence the explicit import
 * (the preflight gate reads FEATURE_AUTODIALER_ENABLED).
 */
@Module({
  // Telephony (webhook auth) is @Global but imported explicitly for clarity;
  // Messaging supplies TRANSACTIONAL_DISPATCHER for the SMS answer type;
  // Audiences supplies the shared AudienceRecipientsResolver the dial engine
  // selects candidates through.
  // QueueModule is NOT global — without this import the DISPATCH_QUEUE_TOKEN
  // injections below silently resolved to undefined (found by the live smoke:
  // the click-to-call target leg was never enqueued). The queue injects are
  // deliberately non-@Optional now so that regression fails the boot smoke.
  imports: [FlagsModule, TelephonyModule, MessagingModule, AudiencesModule, QueueModule],
  controllers: [AutodialerController, AutodialerOpsController, DialerIvrController],
  providers: [
    AutodialerService,
    IvrFlowService,
    SessionProgressService,
    DialerDispatchService,
    DialerCallPlacerService,
    ElectoralLookupService,
    DialerReportingService,
  ],
  // Dispatch + placer are exported for the worker's consumers (app.get on the
  // booted AppModule context).
  exports: [AutodialerService, SessionProgressService, DialerDispatchService, DialerCallPlacerService],
})
export class AutodialerModule {}
