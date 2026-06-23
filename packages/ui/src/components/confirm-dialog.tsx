"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "./button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

/**
 * Destructive-action confirmation, backed by Radix AlertDialog (focus trap, scroll
 * lock, role="alertdialog"). AlertDialog ignores outside-clicks by design; Escape
 * routes to onCancel unless busy. `open` stays parent-controlled.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
            else onCancel();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-4 shadow-md focus:outline-none data-[state=open]:animate-pop-in"
        >
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={busy}>
              {busy ? "Working..." : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
