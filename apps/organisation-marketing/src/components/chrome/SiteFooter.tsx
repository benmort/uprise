import Link from "next/link";
import { Marquee } from "@/components/system/Marquee";
import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { Wordmark } from "./SiteHeader";
import { CONTACT, FOOTER_BLURB, LEGAL, SITEMAP, SOCIALS } from "@/lib/data/site";

/**
 * Dark footer: the reverse "Let's build power —" marquee band, four columns
 * (blurb / sitemap / social / Dispatch signup), and the mono legal bar.
 */
export function SiteFooter() {
  return (
    <footer className="bg-ink text-cream">
      <Marquee reverse durationS={30} className="border-b border-hairline-dark py-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className="whitespace-nowrap pr-6 font-extrabold leading-none tracking-[-0.03em]"
            style={{ fontSize: "clamp(40px,8vw,110px)" }}
          >
            <span className="text-cream">Let&apos;s build </span>
            <span className="text-vermilion">power</span>
            <span className="text-cream"> — </span>
          </span>
        ))}
      </Marquee>

      <div className="mx-auto grid max-w-[1360px] gap-12 px-6 py-16 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.4fr] lg:px-10">
        <div>
          <Wordmark dark />
          <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-cream/55">{FOOTER_BLURB}</p>
        </div>

        <nav aria-label="Sitemap">
          <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-cream/45">Sitemap</h3>
          <ul className="space-y-2.5">
            {SITEMAP.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-[15px] text-cream/80 transition-colors hover:text-vermilion">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Social">
          <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-cream/45">Social</h3>
          <ul className="space-y-2.5">
            {SOCIALS.map((item) => (
              <li key={item.label}>
                <a href={item.href} className="text-[15px] text-cream/80 transition-colors hover:text-vermilion">
                  {item.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-cream/45">
            Dispatch — monthly notes on digital organizing
          </h3>
          <NewsletterForm />
          <p className="mt-6 font-mono text-xs text-cream/45">{CONTACT.email}</p>
        </div>
      </div>

      <div className="border-t border-hairline-dark">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-2 px-6 py-5 font-mono text-xs text-cream/45 lg:px-10">
          <span>{LEGAL.left}</span>
          <span>{LEGAL.right}</span>
        </div>
      </div>
    </footer>
  );
}
