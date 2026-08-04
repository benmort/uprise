import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@uprise/api-client", () => ({ actionPages: { create: vi.fn() } }));
import { actionPages } from "@uprise/api-client";
import { createActionPageAndOpen } from "./actions-pages";

const mockCreate = actionPages.create as unknown as ReturnType<typeof vi.fn>;

describe("createActionPageAndOpen", () => {
  let router: { push: ReturnType<typeof vi.fn> };
  let toast: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockCreate.mockReset();
    router = { push: vi.fn() };
    toast = vi.fn();
  });

  it("creates the draft and opens the builder", async () => {
    mockCreate.mockResolvedValue({ ok: true, data: { id: "ap1" } });
    const id = await createActionPageAndOpen(router, toast);
    expect(id).toBe("ap1");
    expect(mockCreate).toHaveBeenCalledWith({ title: "New click-to-call page" });
    expect(router.push).toHaveBeenCalledWith("/actions/pages/ap1");
  });

  it("surfaces a failure as a toast and never navigates", async () => {
    mockCreate.mockResolvedValue({ ok: false, error: "nope" });
    expect(await createActionPageAndOpen(router, toast)).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error" }));
  });
});
