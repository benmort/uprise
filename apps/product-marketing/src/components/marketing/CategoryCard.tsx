import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * "Built for every kind of campaign" category card — icon chip + name + one-liner,
 * lifting on hover. Mirrors the TailAdmin use-case variations grid.
 */
export default function CategoryCard({
  icon: Icon,
  name,
  description,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
}) {
  return (
    <div className="group flex items-start gap-4 rounded-2xl border border-stroke-secondary bg-white p-6 duration-200 hover:-translate-y-1 hover:border-primary-200 hover:shadow-feature">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-25 text-primary duration-200 group-hover:bg-primary group-hover:text-white">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="mb-1 text-lg font-semibold text-title-color">{name}</h3>
        <p className="text-sm !leading-normal text-text-color-secondary">{description}</p>
      </div>
    </div>
  );
}
