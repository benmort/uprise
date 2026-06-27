"use client";

import { useState } from "react";
import { DoorOpen, ShieldAlert, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";

const STEPS = [
  { icon: DoorOpen, title: "Knock & log in one tap", body: "Open a door, pick what happened. We capture GPS and save it automatically." },
  { icon: Wifi, title: "Works offline", body: "No signal? Everything you log is saved on this phone and syncs when you reconnect." },
  { icon: ShieldAlert, title: "Stay safe", body: "If a door feels unsafe, leave. You can flag “do not return” so nobody is sent back." },
];

/** First-run 60-second how-to + safety primer for volunteers. Shows once per device. */
export function FieldOnboarding() {
  const [seen, setSeen] = useLocalStorage<boolean>("yarns.fieldOnboarded", false);
  const [step, setStep] = useState(0);

  if (seen) return null;
  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm animate-pop-in rounded-2xl bg-surface p-5 shadow-float">
        <div className="flex items-start justify-between">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <button type="button" aria-label="Skip" onClick={() => setSeen(true)} className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 className="mt-3 text-lg font-extrabold">{s.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={i === step ? "h-1.5 w-5 rounded-full bg-primary" : "h-1.5 w-1.5 rounded-full bg-border"}
              />
            ))}
          </div>
          <Button onClick={() => (last ? setSeen(true) : setStep(step + 1))}>
            {last ? "Start knocking" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
