"use client";

import * as React from "react";
import { Loader2, Mic, MicOff, Phone, PhoneOff, User } from "lucide-react";
import { cn } from "../lib/utils";
import { Avatar } from "./avatar";
import { Button } from "./button";
import { Input } from "./input";
import { Keypad } from "./keypad";
import { Spinner } from "./spinner";

/**
 * The click-to-call widget's screens — pure and props-driven so the public
 * action page, the sandboxed embed iframe and the web-component loader all
 * render ONE implementation, themed by BrandStyle. No next/*, no Twilio SDK,
 * no fetch: the effectful container (apps/action click-to-call) feeds state in
 * and receives intents (start / digit / hang up) out. The in-call sub-screens
 * are the source widget's taxonomy driven by the latest progress event.
 */

/** Who the caller is being connected to — a politician gets the full identity. */
export type CallTargetIdentity = {
  name: string;
  party?: string | null;
  electorate?: string | null;
  imageUrl?: string | null;
  /** Commons licence credit for the headshot — shown small when a photo shows. */
  imageCredit?: string | null;
};

export type CallWidgetInCallView =
  | { kind: "waiting" }
  | { kind: "postcode" }
  | { kind: "districts"; options: string[] }
  | { kind: "survey"; question: string; options: Array<{ digit: string; label: string }> }
  | { kind: "redirecting"; name?: string | null; target?: CallTargetIdentity | null }
  | { kind: "connected"; name?: string | null; target?: CallTargetIdentity | null }
  | { kind: "target-gone" };

export type CallWidgetScreen =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "connecting" }
  | { kind: "in-call"; view: CallWidgetInCallView }
  | { kind: "ended"; message?: string | null }
  | { kind: "error"; message: string; canRetry?: boolean; micDenied?: boolean };

export type CallWidgetFields = {
  collectName?: boolean;
  collectEmail?: boolean;
  collectPhone?: boolean;
};

export type CallWidgetValues = { name: string; email: string; phone: string };

/** A selectable member target (public identity + id for the server round-trip). */
export type SelectableTarget = CallTargetIdentity & { id: string };

export interface CallWidgetProps {
  screen: CallWidgetScreen;
  headline?: string | null;
  body?: string | null;
  ctaLabel?: string | null;
  /** Display-safe description of where the call goes (never a number). */
  targetLabel?: string | null;
  /** Pinned member(s) — one renders as an identity banner, several as a picker. */
  targets?: SelectableTarget[];
  selectedTargetId?: string | null;
  onSelectTarget?: (id: string) => void;
  /** Caller-chooses mode: a member finder (name or electorate) above the form. */
  chooser?: boolean;
  targetQuery?: string;
  onTargetQueryChange?: (q: string) => void;
  targetResults?: SelectableTarget[];
  targetsLoading?: boolean;
  /** The resolved target for in-call screens when SSE events lack the photo. */
  activeTarget?: CallTargetIdentity | null;
  fields?: CallWidgetFields;
  values?: CallWidgetValues;
  onValuesChange?: (values: CallWidgetValues) => void;
  onStart?: () => void;
  /** DTMF mirror — every on-screen key press rides the live call. */
  onDigit?: (digit: string) => void;
  /** Digits typed on the postcode keypad so far — echoed in the 4 slots. */
  typedDigits?: string;
  onHangUp?: () => void;
  onRetry?: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
  /** Extra node rendered inside the start form (the Turnstile mount point). */
  captchaSlot?: React.ReactNode;
  /** Shown on mic-denied errors — opens the page outside its iframe. */
  fullPageUrl?: string | null;
  className?: string;
}

const panel =
  "w-full rounded-2xl border border-border bg-surface p-5 text-foreground shadow-sm sm:p-6";

function StatusDot({ tone }: { tone: "live" | "busy" | "idle" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        tone === "live" && "bg-success motion-safe:animate-pulse",
        tone === "busy" && "bg-warning motion-safe:animate-pulse",
        tone === "idle" && "bg-muted-foreground/50",
      )}
    />
  );
}

function HangUpBar({
  onHangUp,
  muted,
  onToggleMute,
}: Pick<CallWidgetProps, "onHangUp" | "muted" | "onToggleMute">) {
  return (
    <div className="mt-5 flex items-center justify-center gap-3">
      {onToggleMute ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Unmute" : "Mute"}
          className="min-h-11"
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="destructive"
        size="lg"
        onClick={onHangUp}
        className="min-h-11 gap-2"
      >
        <PhoneOff className="h-5 w-5" /> Hang up
      </Button>
    </div>
  );
}

/** One member as an identity row — photo/initials, name, party · seat. */
function TargetIdentityRow({
  target,
  compact,
}: {
  target: CallTargetIdentity;
  compact?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3 text-left">
      <Avatar src={target.imageUrl} name={target.name} size={compact ? "md" : "lg"} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{target.name}</span>
        {target.party || target.electorate ? (
          <span className="block truncate text-xs text-muted-foreground">
            {[target.party, target.electorate ? `Member for ${target.electorate}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** The pinned-member banner / picker / finder shown with the start form. */
function TargetSelection({
  targets,
  selectedTargetId,
  onSelectTarget,
  chooser,
  targetQuery,
  onTargetQueryChange,
  targetResults,
  targetsLoading,
  disabled,
}: Pick<
  CallWidgetProps,
  | "targets"
  | "selectedTargetId"
  | "onSelectTarget"
  | "chooser"
  | "targetQuery"
  | "onTargetQueryChange"
  | "targetResults"
  | "targetsLoading"
> & { disabled?: boolean }) {
  const pinned = targets ?? [];
  const results = targetResults ?? [];
  const selected =
    pinned.find((t) => t.id === selectedTargetId) ?? results.find((t) => t.id === selectedTargetId) ?? null;

  if (pinned.length === 1) {
    // One pinned member — make who you're calling unmistakable.
    return (
      <div className="rounded-xl border border-border bg-surface-variant/50 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          You're calling
        </p>
        <TargetIdentityRow target={pinned[0]} />
        {pinned[0].imageUrl && pinned[0].imageCredit ? (
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">Photo: {pinned[0].imageCredit}</p>
        ) : null}
      </div>
    );
  }

  if (pinned.length > 1) {
    return (
      <div role="radiogroup" aria-label="Choose who to call" className="grid gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Choose who to call
        </p>
        {pinned.map((target) => {
          const isSelected = target.id === selectedTargetId;
          return (
            <button
              key={target.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onSelectTarget?.(target.id)}
              className={cn(
                "rounded-xl border p-3 transition-colors",
                isSelected ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-variant/60",
              )}
            >
              <TargetIdentityRow target={target} compact />
            </button>
          );
        })}
      </div>
    );
  }

  if (chooser) {
    return (
      <div className="grid gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Find who to call
        </p>
        {selected ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-primary bg-primary/5 p-3">
            <TargetIdentityRow target={selected} compact />
            <Button type="button" variant="ghost" size="sm" onClick={() => onSelectTarget?.("")} disabled={disabled}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <Input
              value={targetQuery ?? ""}
              onChange={(event) => onTargetQueryChange?.(event.target.value)}
              placeholder="Search by member or electorate…"
              aria-label="Search members"
              disabled={disabled}
            />
            {(targetQuery ?? "").trim() ? (
              <div className="grid max-h-56 gap-1 overflow-y-auto">
                {targetsLoading && results.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">No members match.</p>
                ) : (
                  results.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectTarget?.(target.id)}
                      className="rounded-xl border border-border bg-surface p-2.5 transition-colors hover:bg-surface-variant/60"
                    >
                      <TargetIdentityRow target={target} compact />
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return null;
}

function InCall({
  view,
  targetLabel,
  onDigit,
  typedDigits,
  activeTarget,
}: {
  view: CallWidgetInCallView;
  targetLabel?: string | null;
  onDigit?: (digit: string) => void;
  typedDigits?: string;
  activeTarget?: CallTargetIdentity | null;
}) {
  switch (view.kind) {
    case "postcode":
      return (
        <div>
          <p className="text-sm font-semibold">Enter your postcode</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the keypad — it presses the same keys as your phone would.
          </p>
          <div className="mt-4 flex justify-center gap-2" role="status" aria-label="Postcode entered so far">
            {[0, 1, 2, 3].map((slot) => (
              <span
                key={slot}
                className={cn(
                  "flex h-12 w-10 items-center justify-center rounded-xl border border-border bg-surface-variant text-xl font-bold",
                  (typedDigits ?? "")[slot] ? "text-foreground" : "text-muted-foreground/40",
                )}
              >
                {(typedDigits ?? "")[slot] ?? "·"}
              </span>
            ))}
          </div>
          <Keypad className="mt-4" onKey={(d) => onDigit?.(d)} onBackspace={() => {}} hideBackspace />
        </div>
      );
    case "districts":
      return (
        <div>
          <p className="text-sm font-semibold">Your postcode covers more than one electorate</p>
          <div className="mt-3 grid gap-2">
            {view.options.slice(0, 9).map((name, index) => (
              <Button
                key={name}
                type="button"
                variant="outline"
                className="min-h-11 justify-start"
                onClick={() => onDigit?.(String(index + 1))}
              >
                <span className="mr-2 font-mono text-xs text-muted-foreground">{index + 1}</span>
                {name}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 justify-start text-muted-foreground"
              onClick={() => onDigit?.("0")}
            >
              <span className="mr-2 font-mono text-xs">0</span> I'm not sure
            </Button>
          </div>
        </div>
      );
    case "survey":
      return (
        <div>
          <p className="text-sm font-semibold">{view.question}</p>
          <div className="mt-3 grid gap-2">
            {view.options.map((option) => (
              <Button
                key={option.digit}
                type="button"
                variant="outline"
                className="min-h-11 justify-start"
                onClick={() => onDigit?.(option.digit)}
              >
                <span className="mr-2 font-mono text-xs text-muted-foreground">{option.digit}</span>
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      );
    case "redirecting": {
      const target = view.target ?? activeTarget ?? (view.name ? { name: view.name } : null);
      return (
        <div className="flex items-center gap-3">
          {target ? (
            <Avatar src={target.imageUrl} name={target.name} size="lg" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-sm">
              Connecting you{target ? ` to ${target.name}` : targetLabel ? ` to ${targetLabel}` : ""}…
            </p>
            {target?.party || target?.electorate ? (
              <p className="truncate text-xs text-muted-foreground">
                {[target.party, target.electorate ? `Member for ${target.electorate}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    case "connected": {
      const target = view.target ?? activeTarget ?? (view.name ? { name: view.name } : null);
      return (
        <div>
          <div className="flex items-center gap-3">
            {target ? (
              <Avatar src={target.imageUrl} name={target.name} size="lg" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                <User className="h-5 w-5" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {target ? `You're talking to ${target.name}` : "You're connected"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {target?.party || target?.electorate
                  ? [target.party, target.electorate ? `Member for ${target.electorate}` : null]
                      .filter(Boolean)
                      .join(" · ")
                  : "Speak normally — they can hear you."}
              </p>
            </div>
          </div>
          {target?.imageUrl && target.imageCredit ? (
            <p className="mt-1.5 text-[10px] text-muted-foreground/70">Photo: {target.imageCredit}</p>
          ) : null}
        </div>
      );
    }
    case "target-gone":
      return (
        <p className="text-sm text-muted-foreground">
          The other side has left the call. You can hang up when you're ready.
        </p>
      );
    default:
      return (
        <div className="flex items-center gap-3">
          <Spinner className="h-5 w-5" />
          <p className="text-sm text-muted-foreground">You're on the line — listen for the prompts.</p>
        </div>
      );
  }
}

export function CallWidget({
  screen,
  headline,
  body,
  ctaLabel,
  targetLabel,
  fields,
  values = { name: "", email: "", phone: "" },
  onValuesChange,
  targets,
  selectedTargetId,
  onSelectTarget,
  chooser,
  targetQuery,
  onTargetQueryChange,
  targetResults,
  targetsLoading,
  activeTarget,
  onStart,
  onDigit,
  typedDigits,
  onHangUp,
  onRetry,
  muted,
  onToggleMute,
  captchaSlot,
  fullPageUrl,
  className,
}: CallWidgetProps) {
  const set = (key: keyof CallWidgetValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onValuesChange?.({ ...values, [key]: event.target.value });

  const status =
    screen.kind === "in-call"
      ? screen.view.kind === "connected"
        ? "In call"
        : "On the line"
      : screen.kind === "connecting" || screen.kind === "creating"
        ? "Connecting"
        : screen.kind === "ended"
          ? "Call ended"
          : screen.kind === "error"
            ? "Something went wrong"
            : null;

  return (
    <section className={cn(panel, className)} data-screen={screen.kind}>
      {headline ? <h2 className="text-xl font-extrabold tracking-tight">{headline}</h2> : null}
      {body && (screen.kind === "idle" || screen.kind === "creating") ? (
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{body}</p>
      ) : null}

      {/* One polite live region carries every state change for screen readers. */}
      <p aria-live="polite" className={cn("mt-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground", !status && "sr-only")}>
        {status ? (
          <>
            <StatusDot
              tone={
                screen.kind === "in-call" && screen.view.kind === "connected"
                  ? "live"
                  : screen.kind === "error"
                    ? "idle"
                    : "busy"
              }
            />
            {status}
          </>
        ) : null}
      </p>

      {(screen.kind === "idle" || screen.kind === "creating") && (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onStart?.();
          }}
        >
          <TargetSelection
            targets={targets}
            selectedTargetId={selectedTargetId}
            onSelectTarget={onSelectTarget}
            chooser={chooser}
            targetQuery={targetQuery}
            onTargetQueryChange={onTargetQueryChange}
            targetResults={targetResults}
            targetsLoading={targetsLoading}
            disabled={screen.kind === "creating"}
          />
          {fields?.collectName ? (
            <Input
              placeholder="Your name"
              autoComplete="name"
              value={values.name}
              onChange={set("name")}
              disabled={screen.kind === "creating"}
            />
          ) : null}
          {fields?.collectEmail ? (
            <Input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={values.email}
              onChange={set("email")}
              disabled={screen.kind === "creating"}
            />
          ) : null}
          {fields?.collectPhone ? (
            <Input
              type="tel"
              placeholder="Mobile number"
              autoComplete="tel"
              value={values.phone}
              onChange={set("phone")}
              disabled={screen.kind === "creating"}
            />
          ) : null}
          {captchaSlot}
          <Button type="submit" size="lg" disabled={screen.kind === "creating"} className="min-h-11 gap-2">
            {screen.kind === "creating" ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Phone className="h-5 w-5" aria-hidden />
            )}
            {ctaLabel || "Call now"}
          </Button>
          {targetLabel ? (
            <p className="text-center text-xs text-muted-foreground">
              Calls {targetLabel} from your browser — no phone number required.
            </p>
          ) : null}
        </form>
      )}

      {screen.kind === "connecting" && (
        <div className="mt-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Setting up your call — allow microphone access if asked.</p>
        </div>
      )}

      {screen.kind === "in-call" && (
        <div className="mt-4">
          <InCall
            view={screen.view}
            targetLabel={targetLabel}
            onDigit={onDigit}
            typedDigits={typedDigits}
            activeTarget={activeTarget}
          />
          <HangUpBar onHangUp={onHangUp} muted={muted} onToggleMute={onToggleMute} />
        </div>
      )}

      {screen.kind === "ended" && (
        <div className="mt-4">
          <p className="text-sm">{screen.message || "Thanks for calling."}</p>
          {onRetry ? (
            <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={onRetry}>
              Call again
            </Button>
          ) : null}
        </div>
      )}

      {screen.kind === "error" && (
        <div className="mt-4">
          <p className="text-sm text-error">{screen.message}</p>
          {screen.micDenied && fullPageUrl ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Your browser blocked the microphone in this embedded view.{" "}
              <a
                href={fullPageUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline underline-offset-2"
              >
                Open the full page
              </a>{" "}
              and try again.
            </p>
          ) : null}
          {screen.canRetry && onRetry ? (
            <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
