"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

type ToastTone = "success" | "error" | "warning" | "info";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
  actions?: ToastAction[];
};

type ToastInput = Omit<ToastItem, "id"> & { durationMs?: number };

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLE: Record<ToastTone, string> = {
  success: "border-border bg-background text-foreground",
  error: "border-error/35 bg-background text-foreground",
  warning: "border-border bg-background text-foreground",
  info: "border-border bg-background text-foreground",
};

const TOAST_ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_ICON_STYLE: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-error",
  warning: "text-warning-foreground",
  info: "text-primary",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ durationMs = 4500, ...input }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, ...input }]);
      if (durationMs > 0) {
        window.setTimeout(() => removeToast(id), durationMs);
      }
    },
    [removeToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,420px)] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = TOAST_ICON[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto rounded-md border px-3 py-3 shadow-sm",
                TOAST_STYLE[toast.tone],
              )}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TOAST_ICON_STYLE[toast.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{toast.title}</p>
                  {toast.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">{toast.description}</p>
                  ) : null}
                  {toast.action ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-9 px-2 text-xs"
                      onClick={toast.action.onClick}
                    >
                      {toast.action.label}
                    </Button>
                  ) : null}
                  {toast.actions && toast.actions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {toast.actions.map((action) => (
                        <Button
                          key={action.label}
                          size="sm"
                          variant="ghost"
                          className="h-9 px-2 text-xs"
                          onClick={action.onClick}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="rounded p-1 opacity-70 transition hover:opacity-100"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
