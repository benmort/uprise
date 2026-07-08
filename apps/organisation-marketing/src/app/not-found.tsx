import Link from "next/link";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { SiteFooter } from "@/components/chrome/SiteFooter";

/** The design's 404: eyebrow, a giant numeral, and two pill CTAs — with chrome. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1360px] px-6 pb-28 pt-40 text-center lg:px-10">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-vermilion">Error / 404</p>
        <div
          className="font-extrabold leading-none tracking-[-0.05em] text-ink"
          style={{ fontSize: "clamp(120px,22vw,300px)" }}
          aria-hidden
        >
          404
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          This page went off the ballot.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-ink/65">
          The link you followed does not exist — or it moved. Let us get you back to something
          that ships.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-pill bg-vermilion px-6 py-3.5 text-[15px] font-semibold text-cream transition-colors hover:bg-ink"
          >
            Back home →
          </Link>
          <Link
            href="/contact"
            className="rounded-pill border border-ink/25 px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:bg-ink hover:text-cream"
          >
            Get in touch
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
