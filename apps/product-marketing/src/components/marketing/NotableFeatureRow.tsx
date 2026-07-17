import React from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import PreviewPanel from "./PreviewPanel";

export interface NotableSubFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface NotableRow {
  eyebrow: string;
  title: string;
  subFeatures: NotableSubFeature[];
  /** Flip the media to the left on lg+ (alternating rows). */
  reverse?: boolean;
  image?: { src: string; alt: string; width: number; height: number };
  preview?: { tone?: string; icon: LucideIcon; label: string; chips?: string[] };
}

/**
 * TailAdmin "Build … Effortlessly" alternating row: eyebrow + big heading + two
 * paired sub-features on the text side, and a screenshot or abstract PreviewPanel
 * on the media side. `reverse` flips the media side each row.
 */
export default function NotableFeatureRow({
  eyebrow,
  title,
  subFeatures,
  reverse = false,
  image,
  preview,
}: NotableRow) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? "lg:order-2" : ""}>
        <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-wide text-primary">
          {eyebrow}
        </span>
        <h3 className="mb-8 text-2xl font-bold !leading-[1.2] text-title-color md:text-[32px]">{title}</h3>
        <div className="grid gap-8 sm:grid-cols-2">
          {subFeatures.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title}>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-25 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="mb-2 text-lg font-semibold text-title-color">{s.title}</h4>
                <p className="text-base !leading-normal text-text-color-secondary">{s.description}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className={reverse ? "lg:order-1" : ""}>
        {image ? (
          <div className="overflow-hidden rounded-2xl border-[6px] border-white bg-white shadow-feature ring-1 ring-[#E4E7EC]">
            <Image
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              className="h-auto w-full"
            />
          </div>
        ) : preview ? (
          <PreviewPanel tone={preview.tone} icon={preview.icon} label={preview.label} chips={preview.chips} />
        ) : null}
      </div>
    </div>
  );
}
