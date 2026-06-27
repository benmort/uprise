"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@uprise/ui";
import { getCroppedImg, type CropArea } from "@/lib/crop-image";

/**
 * Avatar crop modal (prog parity): 1:1 round crop with zoom, produces a JPEG blob.
 * `imageSrc` is an object URL for the picked file; `onCropped` receives the blob.
 */
export function AvatarCropper({
  imageSrc,
  busy,
  onCancel,
  onCropped,
}: {
  imageSrc: string;
  busy?: boolean;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);

  const onComplete = useCallback((_: unknown, areaPixels: CropArea) => setArea(areaPixels), []);

  const apply = async () => {
    if (!area) return;
    onCropped(await getCroppedImg(imageSrc, area));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-theme-xl">
        <h3 className="text-lg font-semibold">Crop your avatar</h3>
        <div className="relative h-64 w-full overflow-hidden rounded-xl bg-muted">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        </div>
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} disabled={busy || !area}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
    </div>
  );
}
