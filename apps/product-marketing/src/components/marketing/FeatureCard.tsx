import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Core Features card — the double-border "card-in-card" TailAdmin style with an
 * icon chip that fills brand-blue on hover. Used across the blown-out features grid.
 */
export default function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-3xl border border-stroke-secondary bg-gray-50 p-1 duration-200 hover:border-primary-200 hover:bg-primary-25 md:p-2">
      <div className="flex h-full flex-col rounded-2xl border border-[#F2F4F7] bg-white p-5 md:p-6">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-25 text-primary duration-200 group-hover:bg-primary group-hover:text-white">
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="mb-2.5 text-xl font-semibold text-title-color">{title}</h3>
        <p className="text-base !leading-normal text-text-color-secondary">{description}</p>
      </div>
    </div>
  );
}
