import { assertReactionsLoopSafe, type EventEnvelope } from "@uprise/events";
import { buildTelephonyProvisioningReactions } from "./telephony-provisioning.reactions";

function envelope(eventType: string, payload: Record<string, unknown>): EventEnvelope {
  return {
    id: "evt-1",
    eventType: eventType as EventEnvelope["eventType"],
    tenantId: "tenant-1",
    aggregateId: "run-1",
    payload,
    metadata: {},
    occurredAt: "2026-08-05T00:00:00.000Z",
  };
}

function setup() {
  const provisioning = {
    stepCreateSubaccount: jest.fn(async () => undefined),
    stepDraftCompliance: jest.fn(async () => undefined),
    stepSubmitBundle: jest.fn(async () => undefined),
    stepPurchaseNumber: jest.fn(async () => undefined),
    stepConfigureWebhooks: jest.fn(async () => undefined),
    stepActivate: jest.fn(async () => undefined),
    maybeChainComplementaryRun: jest.fn(async () => ({ chained: true, reason: "chained" })),
  };
  const reactions = buildTelephonyProvisioningReactions({ provisioning: provisioning as never });
  const by = (trigger: string) => reactions.find((r) => r.trigger === trigger);
  return { provisioning, reactions, by };
}

describe("telephony provisioning reactions", () => {
  it("is loop-safe (no reaction emits its own trigger)", () => {
    const { reactions } = setup();
    expect(() => assertReactionsLoopSafe(reactions)).not.toThrow();
  });

  it("drives each step from the previous step's event", async () => {
    const { provisioning, by } = setup();
    const event = envelope("x", { runId: "run-1" });

    await by("telephony.provisioning.requested")!.handle(event);
    await by("telephony.provisioning.subaccount-created")!.handle(event);
    await by("telephony.provisioning.compliance-drafted")!.handle(event);
    await by("telephony.provisioning.compliance-approved")!.handle(event);
    await by("telephony.provisioning.number-purchased")!.handle(event);
    await by("telephony.provisioning.webhooks-configured")!.handle(event);

    expect(provisioning.stepCreateSubaccount).toHaveBeenCalledWith("run-1");
    expect(provisioning.stepDraftCompliance).toHaveBeenCalledWith("run-1");
    expect(provisioning.stepSubmitBundle).toHaveBeenCalledWith("run-1");
    expect(provisioning.stepPurchaseNumber).toHaveBeenCalledWith("run-1");
    expect(provisioning.stepConfigureWebhooks).toHaveBeenCalledWith("run-1");
    expect(provisioning.stepActivate).toHaveBeenCalledWith("run-1");
  });

  // The both-numbers requirement rides this edge: without it, the local (voice) run
  // is back to being a second thing somebody has to remember to start.
  it("a completed run asks the service to chain the complementary class", async () => {
    const { provisioning, by } = setup();
    const reaction = by("telephony.provisioning.activated");

    expect(reaction).toBeDefined();
    expect(reaction!.emits).toEqual(
      expect.arrayContaining(["telephony.provisioning.chained", "telephony.provisioning.requested"]),
    );

    await reaction!.handle(envelope("telephony.provisioning.activated", { runId: "run-1" }));

    expect(provisioning.maybeChainComplementaryRun).toHaveBeenCalledWith("run-1");
  });

  it("falls back to the envelope aggregateId when the payload carries no runId", async () => {
    const { provisioning, by } = setup();

    await by("telephony.provisioning.activated")!.handle(
      envelope("telephony.provisioning.activated", {}),
    );

    expect(provisioning.maybeChainComplementaryRun).toHaveBeenCalledWith("run-1");
  });
});
