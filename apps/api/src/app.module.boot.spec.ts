import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { EmailService } from "./email/email.service";
import { PaymentService } from "./payment/payment.service";
import { CallsService } from "./calls/calls.service";
import { OrgProfileService } from "./org-profile/org-profile.service";

/**
 * Boot smoke: compile the full AppModule DI graph. This is the ONLY gate that
 * catches Nest provider-resolution regressions — typecheck, unit tests (which
 * `new` services with mocks), and `nest build` (compile-only) do NOT. It was a
 * missing @Global() on LoggingModule that crashed `pnpm dev:all` at startup
 * (EmailService couldn't resolve DomainLogger) while every other gate passed.
 *
 * `.compile()` runs every provider constructor (where DI resolution happens) but
 * NOT lifecycle hooks (onModuleInit), so it never opens a DB/Redis connection —
 * PrismaService connects in onModuleInit and BullMQ queues are created lazily.
 */
describe("AppModule DI boot", () => {
  it("resolves the full provider graph", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // Spot-check the @Global domain modules that depend on the global DomainLogger.
    expect(moduleRef.get(EmailService, { strict: false })).toBeInstanceOf(EmailService);
    expect(moduleRef.get(PaymentService, { strict: false })).toBeInstanceOf(PaymentService);
    expect(moduleRef.get(CallsService, { strict: false })).toBeInstanceOf(CallsService);
    expect(moduleRef.get(OrgProfileService, { strict: false })).toBeInstanceOf(OrgProfileService);
    await moduleRef.close();
  }, 30000);
});
