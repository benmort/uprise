import { afterEach, describe, expect, it, vi } from "vitest";
import { captureAttribution } from "./attribution";

const STORAGE_KEY = "uprise.attribution";

type Store = Record<string, string>;

/** Build a fake window with a controllable location.search and an in-memory sessionStorage. */
function stubWindow(search: string, store: Store = {}) {
  const sessionStorage = {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
  };
  vi.stubGlobal("window", { location: { search }, sessionStorage });
  return { sessionStorage, store };
}

describe("captureAttribution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty object when there is no window (SSR)", () => {
    // window is undefined in the node test environment by default.
    expect(captureAttribution()).toEqual({});
  });

  it("maps the utm_* / source / channel params off the URL", () => {
    stubWindow(
      "?source=doorknock&utm_source=fb&utm_medium=cpc&utm_campaign=spring&channel=email",
    );
    expect(captureAttribution()).toEqual({
      signupSource: "doorknock",
      utmSource: "fb",
      utmMedium: "cpc",
      utmCampaign: "spring",
      referrerChannel: "email",
    });
  });

  it("falls back to the ref param for the referrer channel when channel is absent", () => {
    stubWindow("?ref=partner");
    expect(captureAttribution()).toEqual({
      signupSource: undefined,
      utmSource: undefined,
      utmMedium: undefined,
      utmCampaign: undefined,
      referrerChannel: "partner",
    });
  });

  it("persists captured attribution to sessionStorage so it survives the multi-step flow", () => {
    const { sessionStorage } = stubWindow("?utm_source=fb");
    captureAttribution();
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({
        signupSource: undefined,
        utmSource: "fb",
        utmMedium: undefined,
        utmCampaign: undefined,
        referrerChannel: undefined,
      }),
    );
  });

  it("reads previously stored attribution when the current URL carries none", () => {
    const stored = { utmSource: "newsletter" };
    const { sessionStorage } = stubWindow("", {
      [STORAGE_KEY]: JSON.stringify(stored),
    });
    expect(captureAttribution()).toEqual(stored);
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it("returns an empty object when neither the URL nor sessionStorage has attribution", () => {
    stubWindow("");
    expect(captureAttribution()).toEqual({});
  });
});
