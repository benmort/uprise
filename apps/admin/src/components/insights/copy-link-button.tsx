"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Copy a shareable link to the clipboard, with a brief "Copied" confirmation. Pass `url` for an
 * absolute link (e.g. the public poll page on the action app), or `path` for an app-relative one
 * (the current origin is prepended). `url` wins when both are given.
 */
export function CopyLinkButton({
  path,
  url,
  label = "Copy link",
}: {
  path?: string;
  url?: string;
  label?: string;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url_ =
      url ?? (typeof window !== "undefined" ? `${window.location.origin}${path ?? ""}` : (path ?? ""));
    try {
      await navigator.clipboard.writeText(url_);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast({ tone: "success", title: "Link copied", description: url_ });
    } catch {
      showToast({ tone: "error", title: "Couldn't copy", description: "Copy the URL from the address bar." });
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={() => void copy()} title="Copy a shareable link to this poll">
      {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
