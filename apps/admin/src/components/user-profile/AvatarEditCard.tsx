"use client";

import React, { useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/prog/ui/button";
import { Skeleton } from "@uprise/ui";
import { getCroppedImg } from "@/lib/crop-image";
import { profile, type UserAvatarResponse } from "@uprise/api-client";

interface AvatarEditCardProps {
  onClose: () => void;
  onSave: () => void;
  /** When true, renders content only (no card wrapper) for use inside a modal. */
  inModal?: boolean;
}

/**
 * Edit-profile-picture experience (prog parity): saved-avatar gallery (Use/Delete) and
 * upload + round crop. Wired to the uprise profile API. Users with no photo fall back to
 * initials — there are no placeholder avatars.
 */
export default function AvatarEditCard({ onClose, onSave, inModal = false }: AvatarEditCardProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<UserAvatarResponse[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const loadAvatars = useCallback(async () => {
    setAvatarsLoading(true);
    try {
      const res = await profile.listAvatars();
      if (res.ok) setAvatars(res.data);
    } finally {
      setAvatarsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAvatars();
  }, [loadAvatars]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageSrc(URL.createObjectURL(file));
    setCroppedAreaPixels(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const handleSave = async () => {
    setError(null);
    setIsUploading(true);
    try {
      if (imageSrc && croppedAreaPixels) {
        const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
        const res = await profile.uploadAvatar(blob);
        if (res.ok) {
          await loadAvatars();
          onSave();
        } else {
          setError(res.error || "Failed to upload avatar");
        }
      } else {
        setError("Please upload a photo.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectAvatar = async (id: string) => {
    setError(null);
    setSelectingId(id);
    try {
      const res = await profile.selectAvatar(id);
      if (res.ok) {
        await loadAvatars();
        onSave();
      } else {
        setError(res.error || "Failed to select avatar");
      }
    } finally {
      setSelectingId(null);
    }
  };

  const handleDeleteAvatar = async (id: string) => {
    if (!window.confirm("Delete this avatar?")) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await profile.deleteAvatar(id);
      if (res.ok) await loadAvatars();
      else setError(res.error || "Failed to delete avatar");
    } finally {
      setDeletingId(null);
    }
  };

  const clearImage = () => {
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
    setCroppedAreaPixels(null);
  };

  const content = (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">Edit profile picture</h4>
        {!inModal && (
          <Button variant="outline" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20">
          {error}
        </div>
      )}

      {/* Existing avatars: Use / Delete */}
      {(avatarsLoading || avatars.length > 0) && (
        <div>
          <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Your avatars</p>
          <div className="flex flex-wrap gap-4">
            {avatarsLoading ? (
              <>
                <Skeleton className="h-28 w-28 flex-shrink-0 rounded-full dark:bg-gray-700" />
                <Skeleton className="h-28 w-28 flex-shrink-0 rounded-full dark:bg-gray-700" />
                <Skeleton className="h-28 w-28 flex-shrink-0 rounded-full dark:bg-gray-700" />
              </>
            ) : (
              avatars.map((avatar) => {
                const isLoading = selectingId === avatar.id || deletingId === avatar.id;
                return (
                  <div
                    key={avatar.id}
                    className={`relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-full border-2 ${
                      avatar.isSelected
                        ? "border-brand-500 ring-2 ring-brand-500 ring-offset-2"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatar.url} alt="" className="h-full w-full object-cover" />
                    {isLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/50 p-1 opacity-0 transition-opacity hover:opacity-100">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 cursor-pointer px-2 text-xs"
                          onClick={() => void handleSelectAvatar(avatar.id)}
                          disabled={avatar.isSelected}
                        >
                          Use
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-7 cursor-pointer px-2 text-xs"
                          onClick={() => void handleDeleteAvatar(avatar.id)}
                          disabled={deletingId === avatar.id}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Upload + crop */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Upload a new photo</p>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-white hover:file:bg-brand-600"
        />
        {imageSrc && (
          <div className="relative mt-4 h-[280px] w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              style={{ containerStyle: { backgroundColor: "transparent" } }}
            />
          </div>
        )}
        {imageSrc && (
          <div className="mt-2">
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
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        {imageSrc && (
          <Button
            variant="outline"
            className="h-11 cursor-pointer rounded-lg px-6 font-medium"
            onClick={clearImage}
            disabled={isUploading}
          >
            Clear selection
          </Button>
        )}
        <Button
          className="h-11 cursor-pointer rounded-lg bg-brand-500 px-6 font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50"
          onClick={() => void handleSave()}
          disabled={!imageSrc || isUploading}
        >
          {isUploading ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );

  if (inModal) return content;
  return <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:p-6">{content}</div>;
}
