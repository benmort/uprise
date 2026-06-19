"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getFeatureFlags } from "@/lib/api";
import { useLocalStorage } from "@/hooks/use-local-storage";

import {
  getTourById,
  resetExampleData,
  seedExampleData,
  WHATSAPP_TOUR_ID,
  YARNS_TOURS,
  YARNS_TOUR_ID,
  type TourDefinition,
  type TourStep,
} from "./yarns-tour";

export type { TourStep };

export type TourMode = "manual" | "auto";

/** Dwell between auto-play steps — long enough for a navigation + first paint to land. */
export const AUTO_DWELL_MS = 3700;

const TOUR_PROGRESS_KEY = "yarns.tour.progress";
const TOUR_ACTIVE_ID_KEY = "yarns.tour.activeId";

export interface YarnsTourState {
  active: boolean;
  currentStep: number;
  totalSteps: number;
  step: TourStep | null;
  mode: TourMode;
  paused: boolean;
  savedStep: number | null;
  canResume: boolean;
  /** All available tours, for the header menu. */
  tours: TourDefinition[];
  /** Which tour is active (or was last run, for resume). */
  activeTourId: string;
  /** Start a specific tour in the given mode. */
  startTour: (tourId: string, mode: TourMode) => void;
  start: () => void;
  startManual: () => void;
  startAuto: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  /** Settings TLDR: skip the per-control steps and jump to the closing step. */
  skipToEnd: () => void;
  pauseAuto: () => void;
  resumeAuto: () => void;
  switchToManual: () => void;
  close: () => void;
}

const noop = () => {};

export const YarnsTourContext = createContext<YarnsTourState>({
  active: false,
  currentStep: 0,
  totalSteps: getTourById(YARNS_TOUR_ID).steps.length,
  step: null,
  mode: "manual",
  paused: false,
  savedStep: null,
  canResume: false,
  tours: YARNS_TOURS,
  activeTourId: YARNS_TOUR_ID,
  startTour: noop,
  start: noop,
  startManual: noop,
  startAuto: noop,
  resume: noop,
  next: noop,
  prev: noop,
  skipToEnd: noop,
  pauseAuto: noop,
  resumeAuto: noop,
  switchToManual: noop,
  close: noop,
});

export function useYarnsTourState(): YarnsTourState {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<TourMode>("manual");
  const [paused, setPaused] = useState(false);
  const [savedStep, setSavedStep] = useLocalStorage<number | null>(TOUR_PROGRESS_KEY, null);
  const [activeTourId, setActiveTourId] = useLocalStorage<string>(TOUR_ACTIVE_ID_KEY, YARNS_TOUR_ID);

  // The WhatsApp tour walks composer/inbox controls that only render when the
  // FEATURE_WHATSAPP_ENABLED flag is on. Hide it from the menu when the flag is off
  // so steps never spotlight an element that will never appear.
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void getFeatureFlags().then((r) => {
      if (alive && r.ok) setWhatsappEnabled(Boolean(r.data.FEATURE_WHATSAPP_ENABLED));
    });
    return () => {
      alive = false;
    };
  }, []);

  const tours = useMemo(
    () => (whatsappEnabled ? YARNS_TOURS : YARNS_TOURS.filter((tour) => tour.id !== WHATSAPP_TOUR_ID)),
    [whatsappEnabled],
  );

  const steps = getTourById(activeTourId).steps;
  // Callbacks read the live step list through a ref so switching tours doesn't
  // need every callback in its dependency array.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const stepRef = useRef(currentStep);
  stepRef.current = currentStep;

  const advance = useCallback(
    (cur: number) => {
      const nextStep = cur + 1;
      if (nextStep >= stepsRef.current.length) {
        setActive(false);
        setSavedStep(null);
        setCurrentStep(0);
      } else {
        setSavedStep(nextStep);
        setCurrentStep(nextStep);
      }
    },
    [setSavedStep],
  );

  const next = useCallback(() => advance(stepRef.current), [advance]);

  const prev = useCallback(() => {
    const prevStep = Math.max(0, stepRef.current - 1);
    setSavedStep(prevStep);
    setCurrentStep(prevStep);
  }, [setSavedStep]);

  const skipToEnd = useCallback(() => {
    const last = stepsRef.current.length - 1;
    setSavedStep(last);
    setCurrentStep(last);
  }, [setSavedStep]);

  const startTour = useCallback(
    (tourId: string, nextMode: TourMode) => {
      void seedExampleData();
      setActiveTourId(tourId);
      setMode(nextMode);
      setPaused(false);
      setCurrentStep(0);
      setSavedStep(0);
      setActive(true);
    },
    [setActiveTourId, setSavedStep],
  );

  const startManual = useCallback(() => startTour(YARNS_TOUR_ID, "manual"), [startTour]);
  const startAuto = useCallback(() => startTour(YARNS_TOUR_ID, "auto"), [startTour]);

  const resume = useCallback(() => {
    void seedExampleData();
    setMode("manual");
    setPaused(false);
    setCurrentStep(savedStep ?? 0);
    setActive(true);
  }, [savedStep]);

  const pauseAuto = useCallback(() => setPaused(true), []);
  const resumeAuto = useCallback(() => setPaused(false), []);
  const switchToManual = useCallback(() => setMode("manual"), []);

  const close = useCallback(() => {
    setSavedStep(stepRef.current);
    setActive(false);
    setMode("manual");
    setPaused(false);
    setCurrentStep(0);
    resetExampleData();
  }, [setSavedStep]);

  // Auto-play: after the current navigation settles + a dwell, advance.
  useEffect(() => {
    if (!active || mode !== "auto" || paused) return;
    let cancelled = false;
    const dwell = stepsRef.current[currentStep]?.dwellMs ?? AUTO_DWELL_MS;
    void Promise.resolve()
      .then(() => new Promise<void>((r) => setTimeout(r, dwell)))
      .then(() => {
        if (!cancelled) next();
      });
    return () => {
      cancelled = true;
    };
  }, [active, mode, paused, currentStep, next]);

  return {
    active,
    currentStep,
    totalSteps: steps.length,
    step: active ? (steps[currentStep] ?? null) : null,
    mode,
    paused,
    savedStep,
    canResume: savedStep != null && savedStep > 0 && savedStep < steps.length,
    tours,
    activeTourId,
    startTour,
    start: startManual,
    startManual,
    startAuto,
    resume,
    next,
    prev,
    skipToEnd,
    pauseAuto,
    resumeAuto,
    switchToManual,
    close,
  };
}

export function useYarnsTour(): YarnsTourState {
  return useContext(YarnsTourContext);
}
