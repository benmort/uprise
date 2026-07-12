import { put } from "@vercel/blob";
import {
  CommonsImageService,
  commonsFilename,
  commonsFilePageUrl,
  commonsThumbUrl,
  imageExtension,
  stripHtml,
} from "./commons-image.service";
import { ImageUploadService } from "../common/storage/image-upload.service";

const newSvc = () => new CommonsImageService(new ImageUploadService());

jest.mock("@vercel/blob", () => ({
  put: jest.fn(async () => ({ url: "https://blob.example/development/civic/politicians/p1.jpg" })),
}));

const putMock = put as jest.MockedFunction<typeof put>;

describe("commonsFilename", () => {
  it("extracts the file from a P18 Special:FilePath value, decoding + de-underscoring", () => {
    expect(commonsFilename("http://commons.wikimedia.org/wiki/Special:FilePath/Chris%20Bowen%20(2024).jpg")).toBe(
      "Chris Bowen (2024).jpg",
    );
    expect(commonsFilename("https://commons.wikimedia.org/wiki/Special:FilePath/Zali_Steggall.jpg")).toBe(
      "Zali Steggall.jpg",
    );
  });

  it("accepts a File: page URL and a bare filename", () => {
    expect(commonsFilename("https://commons.wikimedia.org/wiki/File:Anthony_Albanese_2022.jpg")).toBe(
      "Anthony Albanese 2022.jpg",
    );
    expect(commonsFilename("Penny Wong.jpg")).toBe("Penny Wong.jpg");
  });

  it("returns null for empty or unrecognisable input", () => {
    expect(commonsFilename("")).toBeNull();
    expect(commonsFilename("   ")).toBeNull();
    expect(commonsFilename("https://example.com/some/path")).toBeNull();
  });
});

describe("commons URL helpers", () => {
  it("builds a file-page URL with underscores + encoding", () => {
    expect(commonsFilePageUrl("Chris Bowen (2024).jpg")).toBe(
      "https://commons.wikimedia.org/wiki/File:Chris_Bowen_(2024).jpg",
    );
  });

  it("builds a fixed-width thumb URL", () => {
    expect(commonsThumbUrl("Penny Wong.jpg")).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Penny_Wong.jpg?width=400",
    );
  });
});

describe("imageExtension", () => {
  it("lowercases the extension and defaults to jpg", () => {
    expect(imageExtension("A.PNG")).toBe("png");
    expect(imageExtension("no-extension")).toBe("jpg");
    expect(imageExtension("weird.名.jpeg")).toBe("jpeg");
  });
});

describe("stripHtml", () => {
  it("reduces Commons Artist HTML to plain text", () => {
    expect(stripHtml('<a href="//x">Jane&nbsp;Doe</a> &amp; friends')).toBe("Jane Doe & friends");
  });
});

describe("CommonsImageService.mirror", () => {
  const originalFetch = global.fetch;
  let originalToken: string | undefined;

  beforeEach(() => {
    putMock.mockClear();
    originalToken = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  });

  it("mirrors the photo and carries the licence + author", async () => {
    global.fetch = jest.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/w/api.php")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: [
                {
                  imageinfo: [
                    {
                      extmetadata: {
                        Artist: { value: '<a href="//x">Mike Doe</a>' },
                        LicenseShortName: { value: "CC BY-SA 4.0" },
                      },
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;

    const svc = newSvc();
    const out = await svc.mirror("Special:FilePath/Chris_Bowen.jpg", "p1");

    expect(out).toEqual({
      imageUrl: "https://blob.example/development/civic/politicians/p1.jpg",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Chris_Bowen.jpg",
      imageCredit: "Mike Doe",
      imageLicence: "CC BY-SA 4.0",
      imageSourceRef: "Chris Bowen.jpg",
    });
    // Blob key is namespaced (dev → development/) and overwrite is allowed for a re-sync.
    const [key, , opts] = putMock.mock.calls[0] as unknown as [string, unknown, { allowOverwrite?: boolean }];
    expect(key).toBe("development/civic/politicians/p1.jpg");
    expect(opts.allowOverwrite).toBe(true);
  });

  it("still stores the image when licence lookup fails — attribution degrades, photo does not", async () => {
    global.fetch = jest.fn(async (url: string | URL) => {
      if (String(url).includes("/w/api.php")) return new Response("nope", { status: 500 });
      return new Response(Buffer.from([1]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;

    const out = await newSvc().mirror("Penny_Wong.jpg", "p2");
    expect(out?.imageUrl).toContain("blob.example");
    expect(out?.imageCredit).toBeNull();
    expect(out?.imageLicence).toBeNull();
  });

  it("returns null (never throws) when the photo can't be fetched", async () => {
    global.fetch = jest.fn(async (url: string | URL) => {
      if (String(url).includes("/w/api.php")) return new Response("{}", { status: 200 });
      return new Response("gone", { status: 404 });
    }) as unknown as typeof fetch;

    expect(await newSvc().mirror("Gone.jpg", "p3")).toBeNull();
    expect(putMock).not.toHaveBeenCalled();
  });

  it("skips entirely when Blob storage is not configured", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    const svc = newSvc();
    expect(svc.enabled).toBe(false);
    expect(await svc.mirror("Anything.jpg", "p4")).toBeNull();
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns null for an unresolvable ref without touching the network", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect(await newSvc().mirror("", "p5")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
