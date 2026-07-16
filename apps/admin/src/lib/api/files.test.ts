import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import { getFilesSummary, listFiles, uploadFile, deleteFile } from "./files";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("files api client", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("getFilesSummary GETs the summary endpoint", async () => {
    await getFilesSummary();
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/files/summary");
    expect(opts).toBeUndefined();
  });

  it("listFiles GETs the bare endpoint when given no options", async () => {
    await listFiles();
    expect(mockReq.mock.calls[0][0]).toBe("/files");
  });

  it("listFiles builds the query string from folder/take/skip", async () => {
    await listFiles({ folder: "img/x", take: 20, skip: 40 });
    expect(mockReq.mock.calls[0][0]).toBe("/files?folder=img%2Fx&take=20&skip=40");
  });

  it("listFiles includes take=0 (explicit zero, not treated as absent)", async () => {
    await listFiles({ take: 0, skip: 0 });
    expect(mockReq.mock.calls[0][0]).toBe("/files?take=0&skip=0");
  });

  it("uploadFile POSTs a FormData with the file and optional folder", async () => {
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    await uploadFile(file, "docs");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/files");
    expect(opts?.method).toBe("POST");
    const body = opts?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("note.txt");
    expect(body.get("folder")).toBe("docs");
    // request() must be left to set the multipart Content-Type itself.
    expect(opts?.headers).toBeUndefined();
  });

  it("uploadFile omits the folder field when none is given", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    await uploadFile(file);
    const body = mockReq.mock.calls[0][1]?.body as FormData;
    expect(body.get("folder")).toBeNull();
  });

  it("deleteFile DELETEs the encoded file id", async () => {
    await deleteFile("f/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/files/f%2F1");
    expect(opts?.method).toBe("DELETE");
  });
});
