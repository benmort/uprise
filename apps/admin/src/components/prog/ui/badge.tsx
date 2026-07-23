// Retiring prog/ui → @uprise/ui. Maps prog's variant/color tones (its raw-colour palette,
// incl. `destructive`) onto the shared token-driven Badge. Consumers get repointed to
// `@uprise/ui` next, then this is deleted. Zero functional regression.
import * as React from "react";
import { Badge as UiBadge, type BadgeProps as UiBadgeProps, badgeVariants } from "@uprise/ui";

type ProgTone = "default" | "secondary" | "destructive" | "outline" | "success" | "error" | "warning" | "info";

const TONE: Record<ProgTone, NonNullable<UiBadgeProps["variant"]>> = {
  default: "default",
  secondary: "secondary",
  destructive: "error",
  outline: "outline",
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ProgTone;
  color?: ProgTone;
}

function Badge({ variant, color, ...props }: BadgeProps) {
  return <UiBadge variant={TONE[color ?? variant ?? "default"]} {...props} />;
}

export { Badge, badgeVariants };
