"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

type TabVariant = "pill" | "underline";

const tabListVariants = cva("flex items-center", {
  variants: {
    variant: {
      pill: "flex-wrap gap-0.5 rounded-xl border border-border bg-surface p-0.5",
      underline: "gap-4 border-b border-border",
    },
  },
  defaultVariants: { variant: "pill" },
});

// Shared trigger styling for BOTH the Radix panel tabs (`data-[state=active]`) and the
// link nav (`data-[active=true]`), so a route tab-bar and an in-page tab-bar look identical.
const tabTriggerVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        pill: "rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
        underline:
          "-mb-px border-b-2 border-transparent px-1 py-2 text-sm text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground",
      },
    },
    defaultVariants: { variant: "pill" },
  },
);

const TabVariantContext = React.createContext<TabVariant>("pill");

// ── Radix panel tabs (in-page tabbed content) ───────────────────────────────
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof tabListVariants>
>(({ className, variant = "pill", ...props }, ref) => (
  <TabVariantContext.Provider value={variant ?? "pill"}>
    <TabsPrimitive.List ref={ref} className={cn(tabListVariants({ variant }), className)} {...props} />
  </TabVariantContext.Provider>
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabVariantContext);
  return <TabsPrimitive.Trigger ref={ref} className={cn(tabTriggerVariants({ variant }), className)} {...props} />;
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-4 focus-visible:outline-none", className)} {...props} />
));
TabsContent.displayName = "TabsContent";

// ── Link-agnostic nav tabs (route-driven tab bars) ──────────────────────────
const TabNav = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof tabListVariants>
>(({ className, variant = "pill", ...props }, ref) => (
  <TabVariantContext.Provider value={variant ?? "pill"}>
    <div ref={ref} role="tablist" className={cn(tabListVariants({ variant }), className)} {...props} />
  </TabVariantContext.Provider>
));
TabNav.displayName = "TabNav";

const TabNavItem = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { active?: boolean; asChild?: boolean }
>(({ className, active, asChild = false, ...props }, ref) => {
  const variant = React.useContext(TabVariantContext);
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      ref={ref}
      role="tab"
      data-active={active ? "true" : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(tabTriggerVariants({ variant }), className)}
      {...props}
    />
  );
});
TabNavItem.displayName = "TabNavItem";

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabNav,
  TabNavItem,
  tabListVariants,
  tabTriggerVariants,
};
