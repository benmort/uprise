"use client";

// Reusable brand image field: pick → crop (configurable aspect + rect/round) → upload
// to the tenant-scoped /files store → store the returned public URL. A generalised
// sibling of the profile-photo flow (AvatarEditCard), but NOT circle-locked: logos come
// in block (≈square) and landscape shapes, and default to PNG so transparency survives.
import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/prog/ui/button";
import { getCroppedImg } from "@/lib/crop-image";
import { uploadFile } from "@/lib/api/files";

export interface ImageCropUploadProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Crop aspect ratio (width / height). 1 = block/square; e.g. 3 or 4 = wide logo. */
  aspect: number;
  /** Round crop overlay (avatars). Default false → rectangular, for logos. */
  round?: boolean;
  helpText?: string;
  /** Output type. PNG (default) keeps transparency; JPEG for photos/hero. */
  mimeType?: "image/png" | "image/jpeg";
  /** Height utility class for the preview + crop box (wide logos want shorter). */
  boxClassName?: string;
}

export function ImageCropUpload({
  label,
  value,
  onChange,
  aspect,
  round = false,
  helpText,
  mimeType = "image/png",
  boxClassName = "h-40",
}: ImageCropUploadProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setImageSrc(URL.createObjectURL(f));
    setAreaPixels(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const onCropComplete = useCallback((_: Area, px: Area) => setAreaPixels(px), []);

  const cancel = () => {
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
    setAreaPixels(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async () => {
    if (!imageSrc || !areaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await getCroppedImg(imageSrc, areaPixels, mimeType);
      const ext = mimeType === "image/png" ? "png" : "jpg";
      const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.${ext}`;
      const res = await uploadFile(new File([blob], name, { type: mimeType }), "branding");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChange(res.data.url);
      cancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <div className="flex items-center gap-2">
          {value ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> {value ? "Replace" : "Upload"}
          </Button>
        </div>
      </div>
      {helpText ? <p className="text-xs text-gray-500 dark:text-gray-400">{helpText}</p> : null}
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />

      {/* Current image — rectangular, object-contain over a neutral bg (never a circle). */}
      {value && !imageSrc ? (
        <div
          className={`flex items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-900 ${boxClassName}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
        </div>
      ) : null}

      {/* Pick → crop → upload. */}
      {imageSrc ? (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <div className={`relative w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 ${boxClassName}`}>
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape={round ? "round" : "rect"}
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Zoom</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={busy || !areaPixels}>
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Uploading…
                </>
              ) : (
                "Crop & upload"
              )}
            </Button>
          </div>
        </div>
      ) : null}
      {error && !imageSrc ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
