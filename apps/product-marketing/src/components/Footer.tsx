import React from "react";
import Link from "next/link";
import NewsletterSignup from "./NewsletterSignup";
import { FOOTER } from "@/lib/footer";

/**
 * The site footer, promoted from the /homepage3 candidate to serve every route.
 *
 * Two INDEPENDENT props, because its three hosts need three different combinations —
 * a single `variant` enum couldn't express them:
 *
 *   `contained`  max-w-7xl, to line up with the content above. Off for /homepage3,
 *                whose sections are full-bleed at a 72px gutter; constraining it there
 *                inset the footer ~88px narrower than the sections above it.
 *   `spaced`     an exterior top margin, for pages whose content ends abruptly. Off
 *                where the last section already supplies its own bottom rhythm — on "/"
 *                the closing panel ends with 130px of padding, so the margin read as a
 *                gap between "Ready to organise?" and the footer.
 *
 * The colours are literals carried over from the homepage3 palette rather than
 * @uprise/ui tokens. That was fine while it was one candidate page; now that it is
 * site-wide the link-hover blue (#2F6BFF) sits a shade off the product brand
 * (#465fff / --color-brand-500) used everywhere else. Worth reconciling — either
 * promote this blue into the design system or switch these to the brand ramp.
 */
export default function Footer({
  contained = true,
  spaced = true,
}: {
  contained?: boolean;
  spaced?: boolean;
}) {
  return (
    <footer
      className={`border-t border-[#E8E8E4] bg-[#FBFBFA] px-6 py-13 md:px-12 lg:px-[72px] ${
        spaced ? "mt-20" : ""
      }`}
    >
      <div className={`flex w-full flex-col gap-7 ${contained ? "mx-auto max-w-7xl" : ""}`}>
        <div className="flex flex-col justify-between gap-10 lg:flex-row lg:gap-12">
          <div className="flex max-w-[34ch] flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/uprise-icon.svg" alt="" className="h-6 w-6" />
              <span className="text-[19px] font-bold text-[#0C0E12]">Uprise</span>
            </div>
            <div className="text-sm leading-relaxed text-[#6B7280]">{FOOTER.blurb}</div>
            <div className="flex items-start gap-2.5 rounded-[10px] border border-[#E4E4DF] bg-white px-4 py-3.5">
              <span aria-hidden className="mt-1 h-2 w-2 flex-none rounded-full bg-[#22C55E]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-[#0C0E12]">{FOOTER.notice.title}</span>
                <span className="text-[13px] text-[#6B7280]">{FOOTER.notice.body}</span>
              </div>
            </div>
          </div>

          {/* Two columns from the smallest screen up. On mobile the short lists (Community,
              Policies) pair off at half width each and align right, so they read as a block against
              the long Resources list above them rather than as three ragged left-aligned stacks. The
              wide list and the newsletter span both cells — Resources' labels wrap at half width,
              and the signup needs its full measure. */}
          <div className="grid grid-cols-2 gap-8 text-sm lg:flex lg:gap-14">
            {FOOTER.columns.map((col) => {
              const split = col.cols === 2;
              return (
                <div
                  key={col.heading}
                  className={`flex flex-col gap-2.5 ${
                    split ? "col-span-2 sm:col-span-1" : "max-sm:text-right"
                  }`}
                >
                  <div className="font-semibold text-[#0C0E12]">{col.heading}</div>
                  {/* CSS multi-column fills DOWN then across, so a split list keeps its
                      reading order and needs no row-count maths as links are added.
                      Single column until lg, where there's room for two side by side
                      without wrapping the longer labels. */}
                  <div
                    className={split ? "columns-1 gap-x-10 lg:columns-2" : "flex flex-col gap-2.5"}
                  >
                    {col.links.map((l) => (
                      <Link
                        key={l.label}
                        href={l.href}
                        className={`text-[#6B7280] hover:text-[#2F6BFF] ${split ? "mb-2.5 block" : ""}`}
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="col-span-2 flex max-w-[30ch] flex-col gap-2.5 sm:col-span-1">
              <div className="font-semibold text-[#0C0E12]">Newsletter</div>
              <div className="text-[#6B7280]">Subscribe for the latest updates</div>
              {/* The wired signup — posts to /marketing/newsletter and handles its own
                  validation, success and error states. It is a client component, so this
                  is the one client boundary inside an otherwise server-rendered footer. */}
              <div className="mt-1">
                <NewsletterSignup />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-8 border-t border-[#EFEFEB] pt-5.5">
          <div className="text-[13px] text-[#8A8F98]">
            © {new Date().getFullYear()} Uprise — All rights reserved.
          </div>
          <div className="flex items-center gap-2.5 text-[13px] text-[#8A8F98]">
            A product by
            <a
              href="https://upriselabs.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[7px] font-semibold text-[#4B5563] hover:text-[#2F6BFF]"
            >
              {/* alt="" is deliberate — the wordmark follows as text, so labelling the
                  mark too would have a screen reader announce "Uprise Labs" twice. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/labs-icon.svg" alt="" className="h-5 w-5" />
              Uprise Labs
            </a>
          </div>
        </div>

        <div className="text-[13px] leading-[1.7] text-[#8A8F98]">{FOOTER.acknowledgement}</div>
      </div>
    </footer>
  );
}
