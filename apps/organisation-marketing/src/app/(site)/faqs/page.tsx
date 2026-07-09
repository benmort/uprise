import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/system/Reveal";
import { FAQS } from "@/lib/data/faqs";

export const metadata: Metadata = {
  title: "FAQs — Uprise Labs",
  description:
    "The honest answers — who we work with, what it costs, how fast we ship, and who owns the code. No corporate markup, no lock-in.",
};

export default function FaqsPage() {
  return (
    <main>
      {/* Hero – pt-40 clears the fixed header */}
      <section className="mx-auto max-w-[1360px] px-6 pt-40 pb-16 lg:px-10">
        <Reveal>
          <div className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            FAQ / ANSWERS
          </div>
          <h1
            className="max-w-[1100px] font-extrabold leading-[0.95] tracking-[-0.04em]"
            style={{ fontSize: "clamp(44px,7vw,104px)" }}
          >
            The honest answers.
          </h1>
          <p className="mt-7 max-w-[620px] text-[19px] leading-normal text-ink/60">
            No corporate markup, no lock-in, no black boxes. Here's what campaigns ask us most —
            and the straight version of every answer.
          </p>
        </Reveal>
      </section>

      {/* FAQ list */}
      <section className="mx-auto max-w-[1360px] px-6 pb-24 lg:px-10">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_1.5fr]">
          <Reveal>
            <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
              FAQ
            </div>
            <h2
              className="font-extrabold tracking-[-0.03em]"
              style={{ fontSize: "clamp(28px,3.4vw,44px)" }}
            >
              Questions we get
              <br />a lot
            </h2>
          </Reveal>
          <div>
            {FAQS.map((faq, i) => (
              <Reveal key={faq.q} delay={i * 60}>
                <div className="border-t border-hairline py-6">
                  <div className="mb-3 text-[21px] font-bold tracking-[-0.01em]">{faq.q}</div>
                  <p className="max-w-[640px] text-base leading-relaxed text-ink/60">{faq.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA – the tier cards used to carry this; keep a single clear ask. */}
      <section className="mx-auto max-w-[1360px] px-6 pb-32 lg:px-10">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-card border border-hairline bg-cream p-10 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
                STILL DECIDING?
              </div>
              <p
                className="font-extrabold leading-[1.02] tracking-[-0.02em]"
                style={{ fontSize: "clamp(24px,2.6vw,34px)" }}
              >
                Tell us the race. We'll scope it honestly.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex flex-none items-center gap-2.5 rounded-pill bg-vermilion px-[26px] py-[15px] text-[15px] font-semibold text-cream transition-colors hover:bg-ink"
            >
              Get in touch <span>→</span>
            </Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
