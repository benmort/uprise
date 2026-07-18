"use client";

import { useState } from "react";
import { Check, Link2, QrCode as QrCodeIcon } from "lucide-react";
import { QrCode } from "@uprise/ui";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Copy a shareable link to the clipboard, with a brief "Copied" confirmation. Pass `url` for an
 * absolute link (e.g. the public poll page on the action app), or `path` for an app-relative one
 * (the current origin is prepended). `url` wins when both are given. With `qr`, offers a toggle
 * that reveals a scannable, downloadable QR of the same link.
 */
export function CopyLinkButton({
  path,
  url,
  label = "Copy link",
  qr = false,
}: {
  path?: string;
  url?: string;
  label?: string;
  qr?: boolean;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const resolved =
    url ?? (typeof window !== "undefined" ? `${window.location.origin}${path ?? ""}` : (path ?? ""));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resolved);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast({ tone: "success", title: "Link copied", description: resolved });
    } catch {
      showToast({ tone: "error", title: "Couldn't copy", description: "Copy the URL from the address bar." });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()} title="Copy a shareable link to this poll">
          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
          {copied ? "Copied" : label}
        </Button>
        {qr ? (
          <Button
            size="sm"
            variant={showQr ? "secondary" : "outline"}
            aria-pressed={showQr}
            onClick={() => setShowQr((v) => !v)}
            title="Show a QR code for this link"
          >
            <QrCodeIcon className="mr-1 h-3.5 w-3.5" />
            QR
          </Button>
        ) : null}
      </div>
      {qr && showQr && resolved ? <QrCode value={resolved} size={160} /> : null}
    </div>
  );
}
