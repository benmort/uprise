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

/**
 * Hosts the "me" experience as a fullscreen slide-up drawer instead of a route — a canvasser
 * pops their sync & profile over the current turf and dismisses it back to exactly where they
 * were (no navigation, no lost map/scroll state). Closes on any route change (e.g. the drawer's
 * own "Done for the day" → /wrap), on Escape, and locks body scroll while open.
 */
export function MeDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false); // drives the slide-up transition
  const pathname = usePathname();
  const openMe = useCallback(() => setOpen(true), []);
  const closeMe = useCallback(() => setOpen(false), []);

  // Navigating away (the drawer sits over whatever route you opened it on) always closes it.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true)); // off-screen → slide up
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
  }, [open]);

  return (
    <MeDrawerContext.Provider value={{ open, openMe, closeMe }}>
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Sync and profile"
              className={`fixed inset-0 z-50 overflow-y-auto bg-background transition-transform duration-300 ease-out ${
                entered ? "translate-y-0" : "translate-y-full"
              }`}
            >
              <div className="mx-auto w-full max-w-lg p-4">
                <SyncCentre onClose={closeMe} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </MeDrawerContext.Provider>
  );
}
