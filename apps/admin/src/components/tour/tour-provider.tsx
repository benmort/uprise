"use client";

import { HelpCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { Button } from "@/components/ui/button";
import { notifyPathname, tourNav } from "@/lib/tours/yarns-tour";
import { YarnsTourContext, useYarnsTour, useYarnsTourState } from "@/lib/tours/use-yarns-tour";

import { FloatingTourCard } from "./floating-tour-card";

const FIRST_RUN_KEY = "yarns.tour.firstRunDone";

/**
 * Holds tour state in context, bridges navigation to the Next router, and auto-starts
 * the walkthrough once on a user's first authenticated visit. Renders the floating card.
 */
export function TourRoot({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const state = useYarnsTourState();
  const [firstRunDone, setFirstRunDone] = useLocalStorage<boolean>(FIRST_RUN_KEY, false);
  const startedRef = useRef(false);
  const startManualRef = useRef(state.startManual);
  startManualRef.current = state.startManual;

  useEffect(() => {
    tourNav.push = (route: string) => router.push(route);
  }, [router]);

  useEffect(() => {
    if (pathname) notifyPathname(pathname);
  }, [pathname]);

  // First login: kick off the manual walkthrough once, then never auto-start again.
  useEffect(() => {
    if (firstRunDone || startedRef.current) return;
    startedRef.current = true;
    setFirstRunDone(true);
    const id = window.setTimeout(() => startManualRef.current(), 600);
    return () => window.clearTimeout(id);
  }, [firstRunDone, setFirstRunDone]);

  return (
    <YarnsTourContext.Provider value={state}>
      {children}
      <FloatingTourCard />
    </YarnsTourContext.Provider>
  );
}

/** Header control: opens a menu to resume, or pick a tour to walk / auto-play. */
export function TourMenuButton() {
  const { tours, activeTourId, canResume, savedStep, totalSteps, startTour, resume } = useYarnsTour();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu is portalled to <body> so the sidebar's `overflow-y-auto` can't clip it;
  // position it (fixed) just above the trigger button each time it opens.
  const toggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen && wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setCoords({ left: rect.left, bottom: window.innerHeight - rect.top + 6 });
      }
      return !wasOpen;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const activeTour = tours.find((tour) => tour.id === activeTourId);

  return (
    <div ref={wrapRef} className="relative">
      <Button
        id="tour-help-button"
        type="button"
        variant="ghost"
        className="w-full justify-start"
        title="Take a tour of Uprise"
        onClick={toggle}
      >
        <HelpCircle className="mr-2 h-4 w-4" />
        Tour
      </Button>
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              style={{ left: coords.left, bottom: coords.bottom }}
              className="fixed z-[100] w-72 overflow-hidden rounded-md border border-border bg-background py-1 shadow-lg"
            >
          {canResume ? (
            <button
              type="button"
              className="block w-full border-b border-border px-3 py-2 text-left text-sm font-medium hover:bg-surface-variant"
              onClick={run(resume)}
            >
              Resume {activeTour?.label ?? "tour"} — step {(savedStep ?? 0) + 1} of {totalSteps}
            </button>
          ) : null}
          {tours.map((tour) => {
            const Icon = tour.icon;
            return (
              <div key={tour.id} className="px-3 py-2">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{tour.label}</p>
                    <p className="text-xs text-muted-foreground">{tour.description}</p>
                  </div>
                </div>
                <div className="mt-1.5 flex gap-2 pl-6">
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-variant"
                    onClick={run(() => startTour(tour.id, "manual"))}
                  >
                    Walk through
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-variant"
                    onClick={run(() => startTour(tour.id, "auto"))}
                  >
                    Auto-play
                  </button>
                </div>
              </div>
            );
          })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
