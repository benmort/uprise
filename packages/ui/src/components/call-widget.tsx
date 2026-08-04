"use client";

import * as React from "react";
import { Loader2, Mic, MicOff, Phone, PhoneOff, User } from "lucide-react";
import { cn } from "../lib/utils";
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

export type CallWidgetInCallView =
  | { kind: "waiting" }
  | { kind: "postcode" }
  | { kind: "districts"; options: string[] }
  | { kind: "survey"; question: string; options: Array<{ digit: string; label: string }> }
  | { kind: "redirecting"; name?: string | null }
  | { kind: "connected"; name?: string | null }
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

export interface CallWidgetProps {
  screen: CallWidgetScreen;
  headline?: string | null;
  body?: string | null;
  ctaLabel?: string | null;
  /** Display-safe description of where the call goes (never a number). */
  targetLabel?: string | null;
  fields?: CallWidgetFields;
  values?: CallWidgetValues;
  onValuesChange?: (values: CallWidgetValues) => void;
  onStart?: () => void;
  /** DTMF mirror — every on-screen key press rides the live call. */
  onDigit?: (digit: string) => void;
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

function InCall({
  view,
  targetLabel,
  onDigit,
}: {
  view: CallWidgetInCallView;
  targetLabel?: string | null;
  onDigit?: (digit: string) => void;
}) {
  switch (view.kind) {
    case "postcode":
      return (
        <div>
          <p className="text-sm font-semibold">Enter your postcode</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the keypad — it presses the same keys as your phone would.
          </p>
          <Keypad className="mt-4" onKey={(d) => onDigit?.(d)} onBackspace={() => {}} />
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
    case "redirecting":
      return (
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <p className="text-sm">
            Connecting you{view.name ? ` to ${view.name}` : ""}
            {!view.name && targetLabel ? ` to ${targetLabel}` : ""}…
          </p>
        </div>
      );
    case "connected":
      return (
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
            <User className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {view.name ? `You're talking to ${view.name}` : "You're connected"}
            </p>
            <p className="text-xs text-muted-foreground">Speak normally — they can hear you.</p>
          </div>
        </div>
      );
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
  onStart,
  onDigit,
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
          <InCall view={screen.view} targetLabel={targetLabel} onDigit={onDigit} />
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
