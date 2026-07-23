"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export type AlertVariant = "success" | "error" | "warning" | "info";

export interface AlertProps {
  variant: AlertVariant;
  /** Optional heading. Omit for a single-line callout (title-less body). */
  title?: string;
  message?: string;
  children?: React.ReactNode;
  showLink?: boolean;
  linkHref?: string;
  linkText?: string;
  /** Render a dismiss (×) button; hides the alert and fires `onDismiss`. */
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const variantClasses: Record<AlertVariant, { container: string; icon: string }> = {
  success: {
    container: "border-success-500 bg-success-50 dark:border-success-500/30 dark:bg-success-500/15",
    icon: "text-success-500 dark:text-success-400",
  },
  error: {
    container: "border-error-500 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15",
    icon: "text-error-500 dark:text-error-400",
  },
  warning: {
    container: "border-amber-500 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/15",
    icon: "text-amber-500 dark:text-amber-400",
  },
  info: {
    container: "border-blue-500 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/15",
    icon: "text-blue-500 dark:text-blue-400",
  },
};

const icons: Record<AlertVariant, React.ReactNode> = {
  success: (
    <svg className="fill-current" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.70186 12.0001C3.70186 7.41711 7.41711 3.70186 12.0001 3.70186C16.5831 3.70186 20.2984 7.41711 20.2984 12.0001C20.2984 16.5831 16.5831 20.2984 12.0001 20.2984C7.41711 20.2984 3.70186 16.5831 3.70186 12.0001ZM15.6197 10.7395C15.9712 10.388 15.9712 9.81819 15.6197 9.46672C15.2683 9.11525 14.6984 9.11525 14.347 9.46672L11.1894 12.6243L9.6533 11.0883C9.30183 10.7368 8.73198 10.7368 8.38051 11.0883C8.02904 11.4397 8.02904 12.0096 8.38051 12.3611L10.553 14.5335C10.7217 14.7023 10.9507 14.7971 11.1894 14.7971C11.428 14.7971 11.657 14.7023 11.8257 14.5335L15.6197 10.7395Z"
      />
    </svg>
  ),
  error: (
    <svg className="fill-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.3499 12.0004C20.3499 16.612 16.6115 20.3504 11.9999 20.3504C7.38832 20.3504 3.6499 16.612 3.6499 12.0004C3.6499 7.38881 7.38833 3.65039 11.9999 3.65039C16.6115 3.65039 20.3499 7.38881 20.3499 12.0004ZM13.0008 16.4753C13.0008 15.923 12.5531 15.4753 12.0008 15.4753L11.9998 15.4753C11.4475 15.4753 10.9998 15.923 10.9998 16.4753C10.9998 17.0276 11.4475 17.4753 11.9998 17.4753L12.0008 17.4753C12.5531 17.4753 13.0008 17.0276 13.0008 16.4753ZM11.9998 6.62898C12.414 6.62898 12.7498 6.96476 12.7498 7.37898L12.7498 13.0555C12.7498 13.4697 12.414 13.8055 11.9998 13.8055C11.5856 13.8055 11.2498 13.4697 11.2498 13.0555L11.2498 7.37898C11.2498 6.96476 11.5856 6.62898 11.9998 6.62898Z"
        fill="currentColor"
      />
    </svg>
  ),
  warning: (
    <svg className="fill-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.6501 12.0001C3.6501 7.38852 7.38852 3.6501 12.0001 3.6501C16.6117 3.6501 20.3501 7.38852 20.3501 12.0001C20.3501 16.6117 16.6117 20.3501 12.0001 20.3501C7.38852 20.3501 3.6501 16.6117 3.6501 12.0001ZM10.9992 7.52517C10.9992 8.07746 11.4469 8.52517 11.9992 8.52517H12.0002C12.5525 8.52517 13.0002 8.07746 13.0002 7.52517C13.0002 6.97289 12.5525 6.52517 12.0002 6.52517H11.9992C11.4469 6.52517 10.9992 6.97289 10.9992 7.52517Z"
        fill="currentColor"
      />
    </svg>
  ),
  info: (
    <svg className="fill-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.6501 11.9996C3.6501 7.38803 7.38852 3.64961 12.0001 3.64961C16.6117 3.64961 20.3501 7.38803 20.3501 11.9996C20.3501 16.6112 16.6117 20.3496 12.0001 20.3496C7.38852 20.3496 3.6501 16.6112 3.6501 11.9996ZM10.9992 7.52468C10.9992 8.07697 11.4469 8.52468 11.9992 8.52468H12.0002C12.5525 8.52468 13.0002 8.07697 13.0002 7.52468C13.0002 6.9724 12.5525 6.52468 12.0002 6.52468H11.9992C11.4469 6.52468 10.9992 6.9724 10.9992 7.52468Z"
        fill="currentColor"
      />
    </svg>
  ),
};

/** Inline alert for forms and feedback (ported from prog marketing). */
export function Alert({
  variant,
  title,
  message,
  children,
  showLink = false,
  linkHref = "#",
  linkText = "Learn more",
  dismissible = false,
  onDismiss,
  className,
}: AlertProps) {
  const { container, icon } = variantClasses[variant];
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  return (
    <div role="alert" className={cn("rounded-xl border p-4", container, className)}>
      <div className="flex items-start gap-3">
        <div className={cn("-mt-0.5 shrink-0", icon)}>{icons[variant]}</div>
        <div className="min-w-0 flex-1">
          {title ? (
            <h4 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h4>
          ) : null}
          {children ??
            (message != null && <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>)}
          {showLink && (
            <a
              href={linkHref}
              className="mt-3 inline-block text-sm font-medium text-gray-500 underline dark:text-gray-400"
            >
              {linkText}
            </a>
          )}
        </div>
        {dismissible ? (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setDismissed(true);
              onDismiss?.();
            }}
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white/90"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
