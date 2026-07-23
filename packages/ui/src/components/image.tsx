"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const imageVariants = cva("block bg-surface-variant", {
  variants: {
    rounded: { none: "", sm: "rounded-md", lg: "rounded-xl", full: "rounded-full" },
    ratio: { auto: "", square: "aspect-square", video: "aspect-video", "4/3": "aspect-[4/3]" },
    fit: { cover: "object-cover", contain: "object-contain" },
  },
  defaultVariants: { rounded: "sm", ratio: "auto", fit: "cover" },
});

export interface ImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement>,
    VariantProps<typeof imageVariants> {
  /** Swapped in when `src` fails to load (else the muted placeholder box shows). */
  fallbackSrc?: string;
}

/**
 * Styled `<img>` — tokenised placeholder background, rounded/aspect/fit variants, and a
 * graceful fallback on load error. For route-optimised images, style a `next/image` with
 * `imageVariants({...})` directly rather than reaching for a Slot here.
 */
const Image = React.forwardRef<HTMLImageElement, ImageProps>(
  ({ className, rounded, ratio, fit, src, fallbackSrc, alt = "", onError, ...props }, ref) => {
    const [errored, setErrored] = React.useState(false);
    const resolved = errored && fallbackSrc ? fallbackSrc : src;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- generic <img> primitive; callers opt into next/image
      <img
        ref={ref}
        src={resolved}
        alt={alt}
        className={cn(imageVariants({ rounded, ratio, fit, className }))}
        onError={(e) => {
          if (!errored) setErrored(true);
          onError?.(e);
        }}
        {...props}
      />
    );
  },
);
Image.displayName = "Image";

export { Image, imageVariants };
