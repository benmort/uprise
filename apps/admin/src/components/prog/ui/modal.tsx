"use client";

// Retiring prog/ui → @uprise/ui. prog's isOpen/onClose portal Modal now renders via the shared
// Radix Modal (focus trap, scroll-lock incl. the <main> scroller via RemoveScroll, portal,
// Escape/outside-click close). bg-surface is forced last so a consumer's prog bg token
// (e.g. bg-card) can't leave the panel transparent; padding stays consumer-controlled (p-0 base,
// as prog had none). Consumers get restructured onto Modal/ModalContent later, then this is deleted.
import * as React from "react";
import { Modal as UiModal, ModalContent, cn } from "@uprise/ui";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  isFullscreen?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true,
  isFullscreen = false,
}) => (
  <UiModal
    open={isOpen}
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <ModalContent
      showClose={showCloseButton}
      className={cn(
        "p-0",
        className,
        isFullscreen && "h-[100dvh] w-screen max-w-none rounded-none",
        "bg-surface",
      )}
    >
      {children}
    </ModalContent>
  </UiModal>
);
