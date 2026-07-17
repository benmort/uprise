import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the transport wrappers the helper calls.
vi.mock("@/lib/api", () => ({ createBlast: vi.fn(), listAudiences: vi.fn() }));
import { createBlast, listAudiences, type MessageChannel } from "@/lib/api";
import { createBlastAndOpen, DEFAULT_BLAST_TEMPLATE } from "./blasts";

const mockCreate = createBlast as unknown as ReturnType<typeof vi.fn>;
const mockList = listAudiences as unknown as ReturnType<typeof vi.fn>;

describe("createBlastAndOpen", () => {
  let router: { push: ReturnType<typeof vi.fn> };
  let toast: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockCreate.mockReset();
    mockList.mockReset();
    router = { push: vi.fn() };
    toast = vi.fn();
  });

  it("defaults to the latest audience + given channel, opens the composer, returns the id", async () => {
    mockList.mockResolvedValue({ ok: true, data: { rows: [{ id: "a1" }] } });
    mockCreate.mockResolvedValue({ ok: true, data: { id: "b1" } });

    const id = await createBlastAndOpen(router, toast, { channel: "SMS" as MessageChannel });

    expect(id).toBe("b1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Blast", bodyTemplate: DEFAULT_BLAST_TEMPLATE, audienceId: "a1", channel: "SMS" }),
    );
    expect(router.push).toHaveBeenCalledWith("/blasts/b1/composer");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" }));
  });

  it("still creates the blast (no audience) when the audience lookup fails", async () => {
    mockList.mockResolvedValue({ ok: false, error: "no audiences" });
    mockCreate.mockResolvedValue({ ok: true, data: { id: "b2" } });

    const id = await createBlastAndOpen(router, toast);

    expect(id).toBe("b2");
    expect(mockCreate.mock.calls[0][0].audienceId).toBeUndefined();
    expect(router.push).toHaveBeenCalledWith("/blasts/b2/composer");
  });

  it("surfaces an error toast and does NOT navigate when creation fails", async () => {
    mockList.mockResolvedValue({ ok: true, data: { rows: [] } });
    mockCreate.mockResolvedValue({ ok: false, error: "boom" });

    const id = await createBlastAndOpen(router, toast);

    expect(id).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", description: "boom" }));
  });
});
