"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSectionProps {
  title?: string;
  subtitle?: string;
  items: FaqItem[];
}

function FaqAccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
}: FaqItem & { isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-3xl bg-gray-50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-start justify-between gap-2 px-6 pb-6 pt-6 text-left text-lg font-medium text-title-color"
      >
        {question}
        <span
          className={`mt-0.5 duration-200 text-text-color-secondary transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <ChevronDown className="h-6 w-6" strokeWidth={1.5} />
        </span>
      </button>
      <div
        className="grid overflow-hidden pl-6 transition-all duration-300"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
        }}
      >
        <div className="overflow-hidden">
          <p className="pb-6 pr-6 text-base leading-7 text-text-color-secondary">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FaqSection({
  title = "Frequently Asked Questions",
  subtitle = "Answered all frequently asked questions, Still confused? feel free to open a support ticket.",
  items,
}: FaqSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="bg-white py-16 md:py-24 lg:py-30">
      <div className="container">
        <div className="mx-auto mb-10 w-full max-w-[770px] text-center lg:mb-[3.125rem]">
          <h2 className="mb-4 text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
            {title}
          </h2>
          <p className="mx-auto w-full max-w-[400px] text-base text-text-color-secondary">
            {subtitle}
          </p>
        </div>
        <div className="mx-auto w-full max-w-[770px]">
          <div className="space-y-2">
            {items.map((item, index) => (
              <FaqAccordionItem
                key={index}
                question={item.question}
                answer={item.answer}
                isOpen={openIndex === index}
                onToggle={() =>
                  setOpenIndex((prev) => (prev === index ? null : index))
                }
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
