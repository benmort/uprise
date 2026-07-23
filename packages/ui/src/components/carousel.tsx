"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

const arrowCls =
  "absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-sm transition hover:bg-surface-variant disabled:pointer-events-none disabled:opacity-0";

export interface CarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Prev/next arrows (default true). */
  arrows?: boolean;
  /** Dot indicators (default true). */
  dots?: boolean;
}

/**
 * Lightweight scroll-snap carousel (no external dep). Wrap each slide in `CarouselItem`
 * and give it a width (e.g. `className="basis-full"` / `"w-72"`). Arrows + dots track the
 * nearest snapped slide.
 */
const Carousel = React.forwardRef<HTMLDivElement, CarouselProps>(
  ({ className, children, arrows = true, dots = true, ...props }, ref) => {
    const trackRef = React.useRef<HTMLDivElement | null>(null);
    const [index, setIndex] = React.useState(0);
    const count = React.Children.count(children);

    const scrollToIndex = React.useCallback((i: number) => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = Math.max(0, Math.min(track.children.length - 1, i));
      const child = track.children[clamped] as HTMLElement | undefined;
      if (child) track.scrollTo({ left: child.offsetLeft - track.offsetLeft, behavior: "smooth" });
    }, []);

    const onScroll = React.useCallback(() => {
      const track = trackRef.current;
      if (!track) return;
      let nearest = 0;
      let best = Infinity;
      Array.from(track.children).forEach((c, i) => {
        const d = Math.abs((c as HTMLElement).offsetLeft - track.offsetLeft - track.scrollLeft);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      setIndex(nearest);
    }, []);

    return (
      <div ref={ref} className={cn("relative", className)} {...props}>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
        {arrows && count > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => scrollToIndex(index - 1)}
              disabled={index <= 0}
              className={cn(arrowCls, "left-2")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => scrollToIndex(index + 1)}
              disabled={index >= count - 1}
              className={cn(arrowCls, "right-2")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
        {dots && count > 1 ? (
          <div className="mt-3 flex justify-center gap-1.5">
            {Array.from({ length: count }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => scrollToIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-4 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);
Carousel.displayName = "Carousel";

const CarouselItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-w-0 shrink-0 snap-start", className)} {...props} />
  ),
);
CarouselItem.displayName = "CarouselItem";

export { Carousel, CarouselItem };
