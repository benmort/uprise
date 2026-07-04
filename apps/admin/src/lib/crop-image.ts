/** Crop an image to the given pixel rect and return a blob (ported from prog). */
export type CropArea = { x: number; y: number; width: number; height: number };

/**
 * Crop `pixelCrop` out of `imageSrc`. Defaults to JPEG (avatars/photos); pass
 * "image/png" for logos so transparency is preserved rather than flattened onto
 * an opaque background. Aspect-agnostic — honours whatever rect the cropper reports.
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: CropArea,
  mimeType: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<Blob> {
  const image = await createImageBitmap(await (await fetch(imageSrc)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pixelCrop.width));
  canvas.height = Math.max(1, Math.round(pixelCrop.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))),
      mimeType,
      mimeType === "image/jpeg" ? 0.92 : undefined,
    );
  });
}
