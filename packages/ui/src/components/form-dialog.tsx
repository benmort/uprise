"use client";

import * as React from "react";
import { Button } from "./button";
import { cn } from "../lib/utils";

type FormDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  /** Called when the form is submitted (Enter or the submit button). */
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  submitDisabled?: boolean;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
};

/**
 * Modal host for a create/edit form. Generalises ConfirmDialog's overlay into a
 * <form> with a Cancel/Submit footer; closes on backdrop click + Escape (unless busy).
 */
export function FormDialog({
  open,
  title,
  description,
  onClose,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  busy = false,
  submitDisabled = false,
  size = "md",
  children,
}: FormDialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  const maxW = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !submitDisabled) onSubmit();
        }}
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-md",
          maxW,
        )}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-4 space-y-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={busy || submitDisabled}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
