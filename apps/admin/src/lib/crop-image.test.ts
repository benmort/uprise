import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCroppedImg } from "./crop-image";

/**
 * `getCroppedImg` sits between the cropper and the bytes that get uploaded to /files, so every
 * assertion here is about what ends up in the store: the right rect, a usable canvas, and a
 * format that does not destroy the image.
 *
 * All four browser seams it touches – fetching the object URL, `createImageBitmap`, the 2D
 * context and `toBlob` – are missing or non-functional under jsdom, so each is faked at the
 * module boundary below. Nothing here fakes the function's own logic.
 */

type ToBlobCall = { type?: string; quality?: number };

const bitmap = { width: 800, height: 600 } as unknown as ImageBitmap;

let drawImage: ReturnType<typeof vi.fn>;
let toBlobCalls: ToBlobCall[];
let canvas: HTMLCanvasElement | null;
/** What the encoder hands back; set to null to simulate a failed encode. */
let encoded: Blob | null;
/** What `getContext("2d")` yields; set to null to simulate a context-less browser. */
let context: CanvasRenderingContext2D | null;

beforeEach(() => {
  drawImage = vi.fn();
  toBlobCalls = [];
  canvas = null;
  encoded = new Blob(["cropped"], { type: "image/jpeg" });
  context = { drawImage } as unknown as CanvasRenderingContext2D;

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ blob: async () => new Blob(["source"]) })),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap),
  );

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    // Captured here rather than by spying on createElement: the dimensions are already set by
    // the time the context is asked for, so this is the same element the encoder later reads.
    canvas = this;
    return context;
  } as unknown as HTMLCanvasElement["getContext"]);

  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback: BlobCallback, type?: string, quality?: number) => {
      toBlobCalls.push({ type, quality });
      callback(encoded);
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getCroppedImg", () => {
  it("crops the rect the cropper reported, not the top-left of the image", async () => {
    // The offset is the whole point of a cropper: dropping x/y would upload the top-left corner
    // of every photo no matter where the organiser dragged the box.
    await getCroppedImg("blob:src", { x: 120, y: 60, width: 200, height: 200 });
    expect(drawImage).toHaveBeenCalledWith(bitmap, 120, 60, 200, 200, 0, 0, 200, 200);
    expect(canvas?.width).toBe(200);
    expect(canvas?.height).toBe(200);
  });

  it("keeps whatever aspect ratio it is handed", async () => {
    // Landscape logos and square avatars share this function; forcing a square here would
    // letterbox or stretch every wide logo uploaded through the branding settings.
    await getCroppedImg("blob:src", { x: 0, y: 0, width: 1200, height: 300 }, "image/png");
    expect(canvas?.width).toBe(1200);
    expect(canvas?.height).toBe(300);
  });

  it("rounds a fractional rect up instead of losing the last pixel", async () => {
    // react-easy-crop reports sub-pixel areas once the image is zoomed. `canvas.width` is an
    // integer attribute, so an unrounded 100.6 would be truncated to 100 and shave a column off
    // the right-hand edge of the crop.
    await getCroppedImg("blob:src", { x: 0.5, y: 0.5, width: 100.6, height: 40.4 });
    expect(canvas?.width).toBe(101);
    expect(canvas?.height).toBe(40);
  });

  it("never builds a zero-sized canvas", async () => {
    // A 0x0 canvas encodes to nothing usable, so the organiser would end up with a broken image
    // URL saved against the tenant. A degenerate rect must still produce a real (if tiny) file.
    await getCroppedImg("blob:src", { x: 0, y: 0, width: 0, height: 0.4 });
    expect(canvas?.width).toBe(1);
    expect(canvas?.height).toBe(1);
  });

  it("defaults to JPEG at 0.92 for photos and avatars", async () => {
    // Avatars are photographs: full-quality PNG would upload megabytes where ~100KB will do.
    await getCroppedImg("blob:src", { x: 0, y: 0, width: 200, height: 200 });
    expect(toBlobCalls).toEqual([{ type: "image/jpeg", quality: 0.92 }]);
  });

  it("encodes PNG with no quality argument when asked", async () => {
    // Logos are asked for as PNG precisely so transparency survives; JPEG would flatten the
    // alpha channel onto black and put a hard rectangle behind every logo in the app. The
    // quality argument is meaningless for a lossless encode, so it must not be passed.
    await getCroppedImg("blob:src", { x: 0, y: 0, width: 400, height: 100 }, "image/png");
    expect(toBlobCalls).toEqual([{ type: "image/png", quality: undefined }]);
  });

  it("resolves with the encoder's blob so the caller can wrap it in a File", async () => {
    const blob = new Blob(["bytes"], { type: "image/png" });
    encoded = blob;
    await expect(
      getCroppedImg("blob:src", { x: 0, y: 0, width: 10, height: 10 }, "image/png"),
    ).resolves.toBe(blob);
  });

  it("rejects with a readable message when there is no 2D context", async () => {
    context = null;
    // The callers surface `e.message` in their error state, and without this guard the failure
    // would arrive as "Cannot read properties of null (reading 'drawImage')".
    await expect(
      getCroppedImg("blob:src", { x: 0, y: 0, width: 10, height: 10 }),
    ).rejects.toThrow("Canvas not supported");
    expect(toBlobCalls).toHaveLength(0);
  });

  it("rejects rather than hanging when the encoder yields nothing", async () => {
    encoded = null;
    // `toBlob` hands back null for an over-large or tainted canvas. A promise that neither
    // resolved nor rejected would leave the upload button stuck on "Uploading…" forever, and a
    // null blob would otherwise be wrapped in a File and shipped to the store.
    await expect(
      getCroppedImg("blob:src", { x: 0, y: 0, width: 10, height: 10 }),
    ).rejects.toThrow("Crop failed");
  });

  it("propagates a failure to read the source image", async () => {
    // The object URL is revoked when the crop panel is cancelled; a racing save must surface an
    // error the component can display, not upload a blank canvas.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      }),
    );
    await expect(
      getCroppedImg("blob:revoked", { x: 0, y: 0, width: 10, height: 10 }),
    ).rejects.toThrow("Failed to fetch");
    expect(drawImage).not.toHaveBeenCalled();
  });
});
