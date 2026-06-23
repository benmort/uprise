import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/components/prog/cn"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
        error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
        warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
        info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  color?: "success" | "error" | "warning" | "info" | "default" | "secondary" | "destructive" | "outline"
}

function Badge({ className, variant, color, ...props }: BadgeProps) {
  // Map color prop to variant for backward compatibility
  const badgeVariant = color ? color : variant
  
  return (
    <div className={cn(badgeVariants({ variant: badgeVariant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
