import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import DocumentationLayout from "@/components/DocumentationLayout";
import { HANDBOOK_SECTIONS, handbookNavigation } from "@/lib/handbook";

export const metadata: Metadata = {
  title: "Handbook – Uprise",
  description:
    "How to run a campaign in Uprise: end-to-end scenario walkthroughs, and the ongoing work of managing people, data and obligations.",
};

/**
 * The /docs index – the user handbook, as distinct from the developer documentation under
 * /developers. Everything here is about running a campaign, not about how the software is built.
 */
export default function HandbookIndexPage() {
  return (
    <DocumentationLayout navigation={handbookNavigation()} exactMatchHrefs={["/docs"]} siteChrome>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-3 mt-8 text-3xl font-bold text-gray-900">The Uprise handbook</h1>
        <p className="mb-10 text-lg leading-relaxed text-gray-700">
          How organisers actually run a campaign – the scenarios end to end, and the managing in
          between.
        </p>

        {/* The paragraph that pointed at /developers is dropped while the developer hub is hidden –
            see (community)/developers/page.tsx. Restore it alongside the nav links, since it is the
            only thing that told handbook readers where the architecture docs live. */}
        <p className="mb-10 text-lg leading-relaxed text-gray-700">
          These pages are about the work, not the software.
        </p>

        {HANDBOOK_SECTIONS.map((section) => (
          <section key={section.title} id={section.title.toLowerCase()} className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900">{section.title}</h2>
            <p className="mt-1 text-gray-600">{section.blurb}</p>

            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {section.docs.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={`/docs/${doc.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-gray-900 group-hover:text-primary">
                        {doc.title}
                      </span>
                      <ArrowUpRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 group-hover:text-primary"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-2 text-sm leading-relaxed text-gray-600">
                      {doc.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Can&apos;t find it?</h2>
          <p className="mt-2 text-gray-700">
            The handbook covers the paths most campaigns walk. For anything else, the{" "}
            <Link href="/support-centre" className="text-primary underline hover:opacity-80">
              support centre
            </Link>{" "}
            is the place to start, or{" "}
            <Link href="/contact-us" className="text-primary underline hover:opacity-80">
              contact us
            </Link>{" "}
            directly.
          </p>
        </div>
      </div>
    </DocumentationLayout>
  );
}
