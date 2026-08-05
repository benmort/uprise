import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@uprise/api-client", () => ({ getApiUrl: vi.fn() }));
import { getApiUrl } from "@uprise/api-client";
import { actionAppOrigin } from "./action-app-origin";

const mockGetApiUrl = getApiUrl as unknown as ReturnType<typeof vi.fn>;

describe("actionAppOrigin", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_ACTION_APP_URL;
    mockGetApiUrl.mockReset();
  });

  it("an explicit env var wins, trailing slash trimmed", () => {
    process.env.NEXT_PUBLIC_ACTION_APP_URL = "https://action.example.org/";
    expect(actionAppOrigin()).toBe("https://action.example.org");
  });

  it("derives action.<env> from the api.<env> host the browser uses (dev tunnel + prod)", () => {
    mockGetApiUrl.mockReturnValue("https://api.dev.uprise.org.au/api/v1");
    expect(actionAppOrigin()).toBe("https://action.dev.uprise.org.au");
    mockGetApiUrl.mockReturnValue("https://api.uprise.org.au/api/v1");
    expect(actionAppOrigin()).toBe("https://action.uprise.org.au");
  });

  it("falls back to local dev when the api host is localhost or unparseable", () => {
    mockGetApiUrl.mockReturnValue("http://localhost:3001/api/v1");
    expect(actionAppOrigin()).toBe("http://localhost:3004");
    mockGetApiUrl.mockReturnValue("not a url");
    expect(actionAppOrigin()).toBe("http://localhost:3004");
  });
});
