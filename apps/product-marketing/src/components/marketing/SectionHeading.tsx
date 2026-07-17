import React from "react";

/**
 * Shared marketing section header — eyebrow pill + display H2 + optional subtitle.
 * Centres by default (the TailAdmin section pattern); `align="left"` for split rows.
 */
export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className = "",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  const box =
    align === "center"
      ? "mx-auto max-w-[760px] items-center text-center"
      : "max-w-[720px] items-start text-left";
  return (
    <div className={`flex w-full flex-col ${box} ${className}`}>
      {eyebrow ? (
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-stroke-secondary bg-white px-4 py-1.5 text-sm font-semibold text-primary shadow-theme-xs">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="text-3xl font-bold !leading-[1.15] text-title-color md:text-[40px]">{title}</h2>
      {subtitle ? (
        <p className="mt-5 text-base !leading-relaxed text-text-color-secondary md:text-lg">{subtitle}</p>
      ) : null}
    </div>
  );
}
