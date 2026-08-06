"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useLocalStorage } from "@uprise/field";

import {
  getTourById,
  resetExampleData,
  seedExampleData,
  slidePosition,
  stageEntryPoints,
  stageOfStep,
  ONBOARDING_TOUR_ID,
  UPRISE_TOURS,
  type TourDefinition,
  type TourStage,
  type TourStep,
} from "./uprise-tour";

export type { TourStep, TourStage };

export type TourMode = "manual" | "auto";

/** Dwell between auto-play steps — long enough for a navigation + first paint to land. */
export const AUTO_DWELL_MS = 3700;

const TOUR_PROGRESS_KEY = "uprise.tour.progress";
const TOUR_ACTIVE_ID_KEY = "uprise.tour.activeId";
/**
 * Whether a tour was running when the page went away.
 *
 * Needed because switching workspace reloads the whole app to re-scope the session
 * (components/topbar/tenant-switcher.tsx). Without this the Climate 200 tour would die at the
 * exact moment it crosses from the network into a campaign — the most important transition it
 * has. Persisting `active` lets the tour pick itself back up on mount.
 */
const TOUR_RUNNING_KEY = "uprise.tour.running";

export interface UpriseTourState {
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
  /** The running tour's stages (empty for a flat tour). */
  stages: TourStage[];
  /** The stage the current step sits in, or null for a flat tour. */
  currentStage: TourStage | null;
  /** 1-based index of the current stage, or 0 for a flat tour. */
  currentStageNumber: number;
  /** Jump straight to a stage's first step — lets a presenter re-cut a demo live. */
  goToStage: (stageId: string) => void;
  /** Position among the tour's slides for the deck footer, or null on a spotlight step. */
  slidePos: { index: number; count: number } | null;
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

export const UpriseTourContext = createContext<UpriseTourState>({
  active: false,
  currentStep: 0,
  totalSteps: getTourById(ONBOARDING_TOUR_ID).steps.length,
  step: null,
  mode: "manual",
  paused: false,
  savedStep: null,
  canResume: false,
  tours: UPRISE_TOURS,
  activeTourId: ONBOARDING_TOUR_ID,
  stages: [],
  currentStage: null,
  currentStageNumber: 0,
  goToStage: noop,
  slidePos: null,
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

export function useUpriseTourState(): UpriseTourState {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<TourMode>("manual");
  const [paused, setPaused] = useState(false);
  const [savedStep, setSavedStep] = useLocalStorage<number | null>(TOUR_PROGRESS_KEY, null);
  const [activeTourId, setActiveTourId] = useLocalStorage<string>(TOUR_ACTIVE_ID_KEY, ONBOARDING_TOUR_ID);
  const [running, setRunning] = useLocalStorage<boolean>(TOUR_RUNNING_KEY, false);

  const tours = UPRISE_TOURS;

  const tour = getTourById(activeTourId);
  const steps = tour.steps;

  /**
   * Re-enter a tour that a workspace switch reloaded out from under us.
   *
   * Only on mount, and only when the tour genuinely was running — `running` is cleared on
   * close/finish, so a user who quit the tour and later switched workspace is not ambushed by it
   * reappearing. Always resumes in manual mode: auto-play mid-reload would start advancing
   * before the presenter has their bearings.
   */
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (rehydratedRef.current) return;
    rehydratedRef.current = true;
    if (!running || savedStep == null) return;
    setCurrentStep(savedStep);
    setMode("manual");
    setActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only rehydrate
  }, []);
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
        setRunning(false);
        setSavedStep(null);
        setCurrentStep(0);
      } else {
        setSavedStep(nextStep);
        setCurrentStep(nextStep);
      }
    },
    [setSavedStep, setRunning],
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
      setRunning(true);
    },
    [setActiveTourId, setSavedStep, setRunning],
  );

  const startManual = useCallback(() => startTour(ONBOARDING_TOUR_ID, "manual"), [startTour]);
  const startAuto = useCallback(() => startTour(ONBOARDING_TOUR_ID, "auto"), [startTour]);

  const resume = useCallback(() => {
    void seedExampleData();
    setMode("manual");
    setPaused(false);
    setCurrentStep(savedStep ?? 0);
    setActive(true);
    setRunning(true);
  }, [savedStep, setRunning]);

  /** Jump to a stage's first step. Manual mode: a presenter jumping stages wants control. */
  const goToStage = useCallback(
    (stageId: string) => {
      const entry = stageEntryPoints(getTourById(activeTourId)).find((e) => e.stage.id === stageId);
      if (!entry) return;
      setMode("manual");
      setPaused(false);
      setSavedStep(entry.stepIndex);
      setCurrentStep(entry.stepIndex);
    },
    [activeTourId, setSavedStep],
  );

  const pauseAuto = useCallback(() => setPaused(true), []);
  const resumeAuto = useCallback(() => setPaused(false), []);
  const switchToManual = useCallback(() => setMode("manual"), []);

  const close = useCallback(() => {
    setSavedStep(stepRef.current);
    setActive(false);
    // Deliberately clears the running flag: a closed tour must not resurrect itself on the next
    // reload. `savedStep` survives, so "Resume" in the menu still works.
    setRunning(false);
    setMode("manual");
    setPaused(false);
    setCurrentStep(0);
    resetExampleData();
  }, [setSavedStep, setRunning]);

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

  const currentStage = active ? stageOfStep(tour, currentStep) : null;
  const slidePos = active ? slidePosition(tour, currentStep) : null;
  const currentStageNumber = currentStage
    ? (tour.stages ?? []).findIndex((s) => s.id === currentStage.id) + 1
    : 0;

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
    stages: tour.stages ?? [],
    currentStage,
    currentStageNumber,
    goToStage,
    slidePos,
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

export function useUpriseTour(): UpriseTourState {
  return useContext(UpriseTourContext);
}
