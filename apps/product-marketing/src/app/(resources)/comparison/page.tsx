import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

import {
  ALL_ROWS,
  AS_AT,
  COMPARISON_GROUPS,
  HORIZON_LABEL,
  plannedByHorizon,
  type Horizon,
  type Status,
  type VendorCell,
} from "@/lib/comparison";

export const metadata = {
  title: "How Uprise compares | Uprise",
  description:
    "A sourced capability comparison of Action Network, NationBuilder and Uprise, with what Uprise ships today and what is planned.",
};

/**
 * The comparison page.
 *
 * Two rules govern everything here. Competitor claims are cited and dated, because naming other
 * vendors only works if a reader can check the claim. And the Uprise column is split into what a
 * customer can reach today versus what is planned, so nothing on this page can be read as a
 * capability we do not have — the gaps are the reason the rest is believable.
 *
 * The marks and grid are lifted from the pricing table (plans/page.tsx) so the two pages read as
 * one system, including the accessible labels on the tick and dash.
 */

// Both marks carry role="img" + a label — without one a screen reader reads a row of empty cells.
function CheckIcon() {
  return (
    <svg
      className="h-5 w-5 text-success-500"
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Yes"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM16.0303 8.96967C16.3232 9.26256 16.3232 9.73744 16.0303 10.0303L11.0303 15.0303C10.7374 15.3232 10.2626 15.3232 9.96967 15.0303L7.96967 13.0303C7.67678 12.7374 7.67678 12.2626 7.96967 11.9697C8.26256 11.6768 8.73744 11.6768 9.03033 11.9697L10.5 13.4393L12.7348 11.2045L14.9697 8.96967C15.2626 8.67678 15.7374 8.67678 16.0303 8.96967Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg
      className="h-5 w-5 text-gray-300"
      viewBox="0 0 24 4"
      fill="none"
      role="img"
      aria-label="No"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 2H22.0007"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STATUS_LABEL: Record<Status, string> = {
  shipped: "Yes",
  partial: "Partly",
  "via-integration": "Partner tool",
  absent: "No",
  unclear: "Unclear",
};

function StatusMark({ status }: { status: Status }) {
  if (status === "shipped") return <CheckIcon />;
  if (status === "absent") return <DashIcon />;
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-color-secondary">
      {STATUS_LABEL[status]}
    </span>
  );
}

function VendorCellView({ cell }: { cell: VendorCell }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <StatusMark status={cell.status} />
      <p className="text-xs leading-snug text-text-color-secondary">{cell.note}</p>
      <a
        href={cell.source}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
      >
        Source
      </a>
    </div>
  );
}

const HORIZON_BLURB: Record<Horizon, string> = {
  next: "Built or specified. These need finishing or switching on.",
  later: "Real build work, not yet started.",
  exploring: "We are thinking about these. Nothing is committed.",
  "not-our-lane": "Deliberately not on our roadmap, and here is why.",
};

export default function ComparisonPage() {
  const totalRows = ALL_ROWS.length;

  return (
    <main>
      {/* Hero */}
      <section className="pb-5 pt-17.5">
        <div className="container">
          <div className="mx-auto mb-5 w-full max-w-[810px] text-center">
            <span className="mb-3 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-color-secondary">
              Comparison
            </span>
            <h1 className="mb-5 text-3xl font-bold text-title-color sm:text-4xl lg:text-5xl">
              How Uprise compares
            </h1>
            <p className="text-base text-text-color-secondary sm:text-lg">
              Action Network and NationBuilder are strong email, petition and fundraising
              platforms. Uprise is a field and voice platform. Most campaigns need both, which is
              why we sync with them rather than ask you to leave.
            </p>
          </div>
        </div>
      </section>

      {/* The framing — stated up front rather than left for a reader to notice */}
      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto w-full max-w-[810px] rounded-2xl border border-stroke bg-white p-6 md:p-8">
            <h2 className="mb-3 text-xl font-bold text-title-color">
              We are not asking you to replace anything
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-text-color">
              The table below is honest about where we are behind, and in three rows we are behind
              both of them. Uprise has no email broadcast, no petitions and no fundraising. If those
              are the jobs you need doing, one of the other two platforms is the right answer and we
              will say so.
            </p>
            <p className="text-sm leading-relaxed text-text-color">
              What we do have is the part neither of them covers well: the doorstep and the phone.
              Turf you can cut from real electoral boundaries, an offline app for the volunteer at
              the door, peer-to-peer texting a volunteer actually sends, and automated calling. Both
              platforms are Uprise{" "}
              <Link href="/integrations" className="text-primary hover:underline">
                integrations
              </Link>
              , so the supporters stay where they are.
            </p>
          </div>
        </div>
      </section>

      {/* The matrix */}
      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto mb-6 w-full max-w-[810px] text-center">
            <h2 className="mb-2 text-2xl font-bold text-title-color sm:text-3xl">
              Capability by capability
            </h2>
            <p className="text-sm text-text-color-secondary">
              {totalRows} capabilities. Competitor entries link to that vendor&apos;s own
              documentation, retrieved {AS_AT}.
            </p>
          </div>

          <div className="w-full overflow-x-auto rounded-3xl border border-stroke bg-white">
            <div className="min-w-[860px]">
              {/* Header */}
              <div className="grid grid-cols-4 border-b border-stroke bg-gray-50">
                <div className="px-5 py-4 text-sm font-bold text-title-color">Capability</div>
                <div className="border-l border-stroke px-5 py-4 text-center text-sm font-bold text-title-color">
                  Action Network
                </div>
                <div className="border-l border-stroke px-5 py-4 text-center text-sm font-bold text-title-color">
                  NationBuilder
                </div>
                <div className="border-l border-stroke bg-primary/5 px-5 py-4 text-center text-sm font-bold text-title-color">
                  Uprise
                </div>
              </div>

              {COMPARISON_GROUPS.map((group) => (
                <div key={group.group}>
                  <div className="border-b border-stroke bg-gray-50/60 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-text-color-secondary">
                    {group.group}
                  </div>
                  {group.rows.map((row) => (
                    <div key={row.area} className="grid grid-cols-4 border-b border-stroke">
                      <div className="px-5 py-5">
                        <p className="text-sm font-semibold text-title-color">{row.area}</p>
                      </div>
                      <div className="border-l border-stroke px-4 py-5">
                        <VendorCellView cell={row.actionNetwork} />
                      </div>
                      <div className="border-l border-stroke px-4 py-5">
                        <VendorCellView cell={row.nationBuilder} />
                      </div>
                      <div className="border-l border-stroke bg-primary/5 px-4 py-5">
                        <div className="flex flex-col items-center gap-1.5 text-center">
                          <StatusMark status={row.upriseToday.status} />
                          <p className="text-xs leading-snug text-text-color-secondary">
                            {row.upriseToday.note}
                          </p>
                          {row.uprisePlanned ? (
                            <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-dashed border-stroke-secondary px-2 py-0.5 text-[11px] font-medium text-text-color-secondary">
                              <Clock className="h-3 w-3" aria-hidden />
                              {HORIZON_LABEL[row.uprisePlanned.horizon]}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What changes after development */}
      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto mb-8 w-full max-w-[810px] text-center">
            <span className="mb-3 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-color-secondary">
              On the roadmap
            </span>
            <h2 className="mb-2 text-2xl font-bold text-title-color sm:text-3xl">
              What closes, and in what order
            </h2>
            <p className="text-sm text-text-color-secondary">
              We build in the open. Nothing below is available yet, and we have not put dates on it
              — sequence is a commitment we can keep, a date is not.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[1170px] space-y-8">
            {(["next", "later", "exploring", "not-our-lane"] as const).map((horizon) => {
              const rows = plannedByHorizon(horizon);
              if (rows.length === 0) return null;
              return (
                <div key={horizon}>
                  <div className="mb-3 flex flex-wrap items-baseline gap-3">
                    <h3 className="text-lg font-bold text-title-color">
                      {HORIZON_LABEL[horizon]}
                    </h3>
                    <p className="text-sm text-text-color-secondary">{HORIZON_BLURB[horizon]}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((row) => (
                      <div
                        key={row.area}
                        className="rounded-2xl border border-dashed border-stroke-secondary bg-white/60 p-5"
                      >
                        <p className="text-sm font-semibold text-title-color">{row.area}</p>
                        <p className="mt-1.5 text-sm leading-relaxed text-text-color-secondary">
                          {row.uprisePlanned?.note}
                        </p>
                        <p className="mt-3 text-xs text-text-color-tertiary">
                          Today: {row.upriseToday.note}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Method */}
      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto w-full max-w-[810px] rounded-2xl border border-stroke bg-gray-50 p-6 md:p-8">
            <h2 className="mb-3 text-lg font-bold text-title-color">How we put this together</h2>
            <ul className="space-y-2.5 text-sm leading-relaxed text-text-color">
              <li>
                Every Action Network and NationBuilder entry links to that vendor&apos;s own
                published documentation, retrieved {AS_AT}. Where we could not establish something
                from public sources we have marked it unclear rather than guessing.
              </li>
              <li>
                We grade ourselves on what a customer can actually reach. Capabilities that exist in
                our codebase but are switched off, or that no plan includes, are listed as not
                available — not as features.
              </li>
              <li>
                These platforms change. If something here is out of date or unfair to a vendor, tell
                us and we will correct it.
              </li>
              <li>
                We make no claim about anyone&apos;s security posture, including our own. Ask all
                three of us for attestations during procurement.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-16 md:pb-24">
        <div className="container">
          <div className="mx-auto w-full max-w-[810px] rounded-3xl border border-stroke bg-white p-8 text-center md:p-12">
            <h2 className="mb-3 text-2xl font-bold text-title-color sm:text-3xl">
              See the part that is hard to explain
            </h2>
            <p className="mx-auto mb-6 max-w-[560px] text-sm text-text-color-secondary sm:text-base">
              The doorstep is the bit a comparison table cannot convey. Fifteen minutes, your
              electorate on the map, and a volunteer app on a real phone.
            </p>
            <Link
              href="/request-demo"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Request a demo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
