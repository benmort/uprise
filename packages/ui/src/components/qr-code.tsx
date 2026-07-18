"use client";

import * as React from "react";
import { Check, Copy, Download } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { qrPngDataUrl, qrSvg, qrFilename } from "../lib/qr";

/**
 * A scannable QR of `value` (a public URL) rendered on white for contrast in either theme,
 * with Download PNG / Download SVG and (where supported) Copy image. Self-contained — drop
 * it under a ShareCard, in a dialog, or beside a link field. Generation is async + client-only.
 */
export function QrCode({
  value,
  size = 176,
  className,
  hideActions = false,
}: {
  value: string;
  /** Rendered QR edge length in px (the frame adds padding). */
  size?: number;
  className?: string;
  /** Preview only, no download/copy buttons. */
  hideActions?: boolean;
}) {
  const [png, setPng] = React.useState<string | null>(null);
  const [svg, setSvg] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const canCopyImage = typeof window !== "undefined" && typeof ClipboardItem !== "undefined";

  React.useEffect(() => {
    let alive = true;
    setPng(null);
    setSvg(null);
    void qrPngDataUrl(value).then((d) => alive && setPng(d)).catch(() => {});
    void qrSvg(value).then((s) => alive && setSvg(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [value]);

  const svgHref = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;

  const copyImage = async () => {
    if (!png) return;
    try {
      const blob = await (await fetch(png)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — Download PNG is the fallback */
    }
  };

  return (
    <div className={cn("flex flex-col items-start gap-3", className)}>
      <div
        className="flex shrink-0 items-center justify-center rounded-lg border border-border bg-white p-3"
        style={{ width: size + 24, height: size + 24 }}
      >
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={png} alt="QR code" className="h-full w-full" style={{ imageRendering: "pixelated" }} />
        ) : (
          <div className="h-full w-full animate-pulse rounded bg-surface-variant" />
        )}
      </div>
      {!hideActions && png && svgHref ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={png} download={qrFilename(value, "png")}>
              <Download className="mr-1 h-4 w-4" /> PNG
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={svgHref} download={qrFilename(value, "svg")}>
              <Download className="mr-1 h-4 w-4" /> SVG
            </a>
          </Button>
          {canCopyImage ? (
            <Button type="button" variant="ghost" size="sm" onClick={copyImage}>
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {copied ? "Copied" : "Copy image"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
