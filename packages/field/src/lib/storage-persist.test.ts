import { afterEach, describe, expect, it, vi } from "vitest";
import { requestPersistentStorage } from "./storage-persist";

const orig = globalThis.navigator;

function stubStorage(storage: unknown) {
  Object.defineProperty(globalThis, "navigator", {
    value: storage === undefined ? undefined : { storage },
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", { value: orig, configurable: true });
  vi.restoreAllMocks();
});

describe("requestPersistentStorage", () => {
  it("returns 'unsupported' when navigator or the API is absent", async () => {
    stubStorage(undefined);
    expect(await requestPersistentStorage()).toBe("unsupported");
    stubStorage({}); // storage present but no persist()
    expect(await requestPersistentStorage()).toBe("unsupported");
  });

  it("returns 'already' without re-requesting when storage is persisted", async () => {
    const persist = vi.fn();
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
    expect(await requestPersistentStorage()).toBe("already");
    expect(persist).not.toHaveBeenCalled();
  });

  it("requests persistence and maps the boolean result", async () => {
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(true) });
    expect(await requestPersistentStorage()).toBe("granted");
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) });
    expect(await requestPersistentStorage()).toBe("denied");
  });

  it("requests persistence when persisted() is missing", async () => {
    stubStorage({ persist: vi.fn().mockResolvedValue(true) });
    expect(await requestPersistentStorage()).toBe("granted");
  });

  it("treats a thrown query as unsupported rather than throwing", async () => {
    stubStorage({
      persisted: vi.fn().mockRejectedValue(new Error("locked down")),
      persist: vi.fn(),
    });
    expect(await requestPersistentStorage()).toBe("unsupported");
  });
});
