"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Password field with a show/hide toggle. Same look as Input; the eye button sits
 * inside the field and flips the input type. Forwards all native input props.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      // suppressHydrationWarning: password managers inject a toggle/icon node
      // into this wrapper before hydration; the wrapper's own render is stable.
      <div className="relative" suppressHydrationWarning>
        <input
          type={visible ? "text" : "password"}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
