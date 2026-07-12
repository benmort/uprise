import { put } from "@vercel/blob";
import { ImageUploadService } from "./image-upload.service";

jest.mock("@vercel/blob", () => ({ put: jest.fn(async () => ({ url: "https://blob.example/development/x.jpg" })) }));
const putMock = put as jest.MockedFunction<typeof put>;

describe("ImageUploadService", () => {
  let originalToken: string | undefined;
  const svc = new ImageUploadService();

  beforeEach(() => {
    putMock.mockClear();
    originalToken = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  });

  describe("extFrom", () => {
    it("returns a lowercase alphanumeric extension or the fallback", () => {
      expect(svc.extFrom("Photo.PNG")).toBe("png");
      expect(svc.extFrom("no-extension")).toBe("jpg");
      expect(svc.extFrom(undefined, "pdf")).toBe("pdf");
      expect(svc.extFrom("a.j!p?g")).toBe("jpg");
    });
  });

  describe("put", () => {
    it("namespaces the key and uploads publicly", async () => {
      const out = await svc.put(Buffer.from([1, 2]), { key: "avatars/u1.jpg", contentType: "image/jpeg" });
      const [key, , opts] = putMock.mock.calls[0] as unknown as [string, unknown, { access: string; allowOverwrite?: boolean }];
      expect(key).toBe("development/avatars/u1.jpg"); // namespaced (dev prefix)
      expect(opts.access).toBe("public");
      expect(opts.allowOverwrite).toBeUndefined();
      expect(out.url).toContain("blob.example");
      expect(out.key).toBe("development/avatars/u1.jpg");
    });

    it("passes allowOverwrite through for stable re-syncable keys", async () => {
      await svc.put(Buffer.from([1]), { key: "civic/politicians/p1.jpg", allowOverwrite: true });
      const [, , opts] = putMock.mock.calls[0] as unknown as [string, unknown, { allowOverwrite?: boolean }];
      expect(opts.allowOverwrite).toBe(true);
    });

    it("throws when storage is not configured", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.BLOB_STORE_ID;
      await expect(svc.put(Buffer.from([1]), { key: "x.jpg" })).rejects.toThrow(/not configured/);
      expect(putMock).not.toHaveBeenCalled();
    });
  });

  describe("randomKey", () => {
    it("builds a unique key under a prefix", () => {
      const a = svc.randomKey("door-knocks", "jpg");
      const b = svc.randomKey("door-knocks", "jpg");
      expect(a).toMatch(/^door-knocks\/\d+-[a-z0-9]+\.jpg$/);
      expect(a).not.toBe(b);
    });
  });

  describe("mirror", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("fetches a remote image and re-hosts it", async () => {
      global.fetch = jest.fn(async () =>
        new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } }),
      ) as unknown as typeof fetch;
      const out = await svc.mirror("https://commons/File.png", { key: "civic/politicians/p1.png", allowOverwrite: true });
      expect(out?.contentType).toBe("image/png");
      expect(out?.url).toContain("blob.example");
      const [, , opts] = putMock.mock.calls[0] as unknown as [string, unknown, { allowOverwrite?: boolean }];
      expect(opts.allowOverwrite).toBe(true);
    });

    it("returns null (never throws) on a non-200 or a network error", async () => {
      global.fetch = jest.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
      expect(await svc.mirror("https://x/y.jpg", { key: "k.jpg" })).toBeNull();
      global.fetch = jest.fn(async () => {
        throw new Error("network");
      }) as unknown as typeof fetch;
      expect(await svc.mirror("https://x/y.jpg", { key: "k.jpg" })).toBeNull();
      expect(putMock).not.toHaveBeenCalled();
    });

    it("returns null when storage is disabled, without fetching", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.BLOB_STORE_ID;
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;
      expect(await svc.mirror("https://x/y.jpg", { key: "k.jpg" })).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
