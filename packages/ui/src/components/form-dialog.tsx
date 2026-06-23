"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
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

const SIZE_MAX_W: Record<NonNullable<FormDialogProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

/**
 * Modal host for a create/edit form, backed by Radix Dialog (focus trap, scroll
 * lock, labelled by its title). Closes on backdrop click + Escape unless busy; the
 * <form> footer drives Cancel/Submit. Public props are unchanged from the hand-rolled
 * version it replaces.
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
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-md focus:outline-none data-[state=open]:animate-pop-in",
            SIZE_MAX_W[size],
          )}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && !submitDisabled) onSubmit();
            }}
          >
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {description}
              </Dialog.Description>
            ) : null}
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
