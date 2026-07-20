"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { SyncCentre } from "./sync-centre";

type MeDrawerValue = { open: boolean; openMe: () => void; closeMe: () => void };

const MeDrawerContext = createContext<MeDrawerValue | null>(null);

/** Open/close the "me" (sync & profile) fullscreen drawer from any field screen. */
export function useMeDrawer(): MeDrawerValue {
  const ctx = useContext(MeDrawerContext);
  if (!ctx) throw new Error("useMeDrawer must be used within a MeDrawerProvider");
  return ctx;
}

/** How long the slide-in/out lasts — keep in sync with the `duration-300` classes below. */
const TRANSITION_MS = 300;

/**
 * Hosts the "me" experience as a left side drawer instead of a route — a canvasser pops
 * their sync & profile over the current turf (the Menu button lives top-left, so the panel
 * slides in from that edge) and dismisses it back to exactly where they were (no navigation,
 * no lost map/scroll state). A tap on the dimmed backdrop, the Close button, Escape, or any
 * route change (e.g. the drawer's own "Done for the day" → /wrap) closes it; body scroll is
 * locked while open. The panel stays mounted through the exit transition so it slides back out.
 */
export function MeDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false); // mounted through the exit transition
  const [entered, setEntered] = useState(false); // drives the slide-in/out + backdrop fade
  const pathname = usePathname();
  const openMe = useCallback(() => setOpen(true), []);
  const closeMe = useCallback(() => setOpen(false), []);

  // Navigating away (the drawer sits over whatever route you opened it on) always closes it.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (open) {
      setRender(true);
      const raf = requestAnimationFrame(() => setEntered(true)); // off-screen → slide in
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("keydown", onKey);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        cancelAnimationFrame(raf);
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = prevOverflow;
      };
    }
    // Closing: play the exit transition, then unmount once it has finished.
    setEntered(false);
    const timer = setTimeout(() => setRender(false), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <MeDrawerContext.Provider value={{ open, openMe, closeMe }}>
      {children}
      {render && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50">
              {/* Dimmed backdrop — a tap anywhere off the panel closes the drawer. */}
              <div
                aria-hidden="true"
                onClick={closeMe}
                className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${
                  entered ? "opacity-100" : "opacity-0"
                }`}
              />
              {/* Side panel, sliding in from the left edge. */}
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Sync and profile"
                className={`absolute inset-y-0 left-0 w-[86%] max-w-sm overflow-y-auto bg-background shadow-2xl transition-transform duration-300 ease-out ${
                  entered ? "translate-x-0" : "-translate-x-full"
                }`}
              >
                <div className="w-full p-4">
                  <SyncCentre onClose={closeMe} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </MeDrawerContext.Provider>
  );
}
