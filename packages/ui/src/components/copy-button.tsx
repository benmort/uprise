"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./button";
import { useCopyToClipboard } from "../hooks/use-copy-to-clipboard";

export interface CopyButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "onClick" | "children" | "value"> {
  /** The text to copy — or a lazy producer (e.g. a URL built at click time). */
  value: string | (() => string);
  /** Button label; omitted in `iconOnly` mode. */
  label?: string;
  /** Label shown during the copied window. */
  copiedLabel?: string;
  /** Icon-only square button (`size="icon"`); `label` becomes the aria-label. */
  iconOnly?: boolean;
  /** Fires after a successful copy with the copied text — hang app-side toasts here. */
  onCopied?: (text: string) => void;
}

/**
 * The one copy-to-clipboard button: click → clipboard → a brief ✓ "Copied" state.
 * Toasts stay app-side via `onCopied` (the primitive stays toast-agnostic).
 */
export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      value,
      label = "Copy",
      copiedLabel = "Copied",
      iconOnly = false,
      onCopied,
      variant = "outline",
      size,
      ...rest
    },
    ref,
  ) => {
    const [copied, copy] = useCopyToClipboard();
    const Icon = copied ? Check : Copy;

    const handleClick = async () => {
      const text = typeof value === "function" ? value() : value;
      if (await copy(text)) onCopied?.(text);
    };

    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size ?? (iconOnly ? "icon" : "sm")}
        aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
        onClick={() => void handleClick()}
        {...rest}
      >
        <Icon className={iconOnly ? "h-4 w-4" : "mr-1.5 h-3.5 w-3.5"} />
        {iconOnly ? null : copied ? copiedLabel : label}
      </Button>
    );
  },
);
CopyButton.displayName = "CopyButton";
