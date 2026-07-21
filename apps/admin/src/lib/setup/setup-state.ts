import type { ChannelSetupStep, SetupStep, TenantSetupState } from "@uprise/api-client";
import type { SetupFlowKey } from "./step-registry";

/**
 * Pure derivations over the server's TenantSetupState — progress counts, completion,
 * chip mapping and the tracker's dismiss/resurface rules. All display logic funnels
 * through here so the page, the tracker and the gates read one vocabulary.
 */

type AnyStep = SetupStep | ChannelSetupStep;

const isChannel = (s: AnyStep): s is ChannelSetupStep => "state" in s;

/** A step that still needs the user (excluded: done, recommended-polish, plan-locked, in-flight). */
export function isAttention(step: AnyStep): boolean {
  if (isChannel(step)) {
    if (step.planLocked) return false;
    return step.state === "none" || step.state === "action_required" || step.state === "failed";
  }
  return step.status === "todo";
}

/** Counted toward "n of m" — everything except plan-locked channel steps. */
function counted(step: AnyStep): boolean {
  return !(isChannel(step) && step.planLocked);
}

function isDone(step: AnyStep): boolean {
  return isChannel(step) ? step.state === "active" : step.status === "done";
}

function flowsOf(state: TenantSetupState): Array<{ key: SetupFlowKey; steps: AnyStep[] }> {
  const out: Array<{ key: SetupFlowKey; steps: AnyStep[] }> = [
    { key: "self", steps: state.flows.self.steps },
  ];
  if (state.flows.organisation.applicable) out.push({ key: "organisation", steps: state.flows.organisation.steps });
  if (state.flows.channels.applicable) out.push({ key: "channels", steps: state.flows.channels.steps });
  return out;
}

export function flowProgress(steps: AnyStep[]): { done: number; total: number } {
  const countable = steps.filter(counted);
  return { done: countable.filter(isDone).length, total: countable.length };
}

export function overallProgress(state: TenantSetupState): { done: number; total: number } {
  return flowsOf(state).reduce(
    (acc, f) => {
      const p = flowProgress(f.steps);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 },
  );
}

/** Complete = every applicable flow's server-computed `complete` flag. Recommended steps,
 *  requested email and plan-locked channels never block. */
export function setupComplete(state: TenantSetupState): boolean {
  return (
    state.flows.self.complete &&
    (!state.flows.organisation.applicable || state.flows.organisation.complete) &&
    (!state.flows.channels.applicable || state.flows.channels.complete)
  );
}

/** The first step still needing the user, in display order — the tracker's headline. */
export function nextStep(state: TenantSetupState): { flow: SetupFlowKey; step: AnyStep } | null {
  for (const f of flowsOf(state)) {
    const attention = f.steps.find(isAttention);
    if (attention) return { flow: f.key, step: attention };
  }
  return null;
}

/** Map a step onto the StatusBadge vocabulary (single chip choke point). */
export function chipStatus(step: AnyStep): string {
  if (isChannel(step)) {
    if (step.planLocked) return "PLAN_LOCKED";
    switch (step.state) {
      case "active":
        return "DONE";
      case "requested":
        return "REQUESTED";
      case "in_progress":
        return "IN_PROGRESS";
      case "action_required":
        return "ACTION_REQUIRED";
      case "failed":
        return "FAILED";
      default:
        return "TODO";
    }
  }
  switch (step.status) {
    case "done":
      return "DONE";
    case "recommended":
      return "RECOMMENDED";
    default:
      return "TODO";
  }
}

// ── Tracker dismissal (per-user localStorage; personal chrome, never tenant state) ──

export type DismissSnapshot = {
  at: string;
  /** Keys that needed attention when dismissed — a NEW one resurfaces the tracker. */
  attention: string[];
};

export function attentionKeys(state: TenantSetupState): string[] {
  return flowsOf(state).flatMap((f) => f.steps.filter(isAttention).map((s) => s.key));
}

/** A dismissed tracker comes back when a step (re)starts needing attention — e.g. a
 *  compliance rejection after the user dismissed with everything in flight. */
export function shouldResurface(snap: DismissSnapshot | null, state: TenantSetupState): boolean {
  if (!snap) return true; // never dismissed
  const dismissed = new Set(snap.attention);
  return attentionKeys(state).some((key) => !dismissed.has(key));
}
