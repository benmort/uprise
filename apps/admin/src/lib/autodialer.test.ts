import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@uprise/api-client", () => ({ autodialer: { create: vi.fn() } }));
import { autodialer } from "@uprise/api-client";
import {
  DIALER_BEHAVIOUR_OPTIONS,
  behaviourFlags,
  createDialerCampaignAndOpen,
} from "./autodialer";

const mockCreate = autodialer.create as unknown as ReturnType<typeof vi.fn>;

describe("behaviourFlags", () => {
  it("maps each picker card onto the source's behaviour matrix, one flag at a time", () => {
    expect(behaviourFlags("broadcast")).toEqual({
      outboundOnly: true,
      survey: false,
      electoralTarget: false,
      transparentTargetTransfer: false,
    });
    expect(behaviourFlags("survey").survey).toBe(true);
    expect(behaviourFlags("target").electoralTarget).toBe(true);
    expect(behaviourFlags("transfer").transparentTargetTransfer).toBe(true);
    // Every option key resolves — the picker and the matrix can't drift.
    for (const option of DIALER_BEHAVIOUR_OPTIONS) {
      expect(() => behaviourFlags(option.key)).not.toThrow();
    }
  });
});

describe("createDialerCampaignAndOpen", () => {
  let router: { push: ReturnType<typeof vi.fn> };
  let toast: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockCreate.mockReset();
    router = { push: vi.fn() };
    toast = vi.fn();
  });

  it("creates the draft with the chosen behaviour and opens the editor tab", async () => {
    mockCreate.mockResolvedValue({ ok: true, data: { id: "dc1" } });
    const id = await createDialerCampaignAndOpen(router, toast, "survey");
    expect(id).toBe("dc1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New calling campaign", survey: true, outboundOnly: true }),
    );
    expect(router.push).toHaveBeenCalledWith("/autodialer/dc1?tab=edit");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" }));
  });

  it("surfaces a failure as a toast and never navigates", async () => {
    mockCreate.mockResolvedValue({ ok: false, error: "plan limit" });
    const id = await createDialerCampaignAndOpen(router, toast, "broadcast");
    expect(id).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error", description: "plan limit" }),
    );
  });
});
