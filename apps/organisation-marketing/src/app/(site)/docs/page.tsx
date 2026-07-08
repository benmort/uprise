import type { Metadata } from "next";
import { Reveal } from "@/components/system/Reveal";
import { DOCS_GROUPS } from "@/lib/data/site";

export const metadata: Metadata = {
  title: "Docs — Uprise Labs",
  description: "Everything you need to run the platform we built you.",
};

// The article shown by default – the first item of the first sidebar group.
const ACTIVE_ITEM = "Kickoff & discovery";

const NEEDS = [
  "Domain registrar and DNS access",
  "ActBlue (or processor) entity ID",
  "Brand assets — logo, colors, typefaces",
  "A single point of contact for approvals",
];

export default function DocsPage() {
  return (
    <main>
      {/* Hero – playbook eyebrow + title */}
      <section className="mx-auto max-w-[1360px] px-6 pb-10 pt-40 lg:px-10">
        <Reveal>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            DOCS / CLIENT PLAYBOOK
          </p>
          <h1
            className="max-w-[900px] font-extrabold leading-[1.0] tracking-[-0.035em]"
            style={{ fontSize: "clamp(32px,4vw,56px)" }}
          >
            Everything you need to run the platform we built you.
          </h1>
        </Reveal>
      </section>

      {/* Sidebar nav + article body */}
      <section className="mx-auto max-w-[1360px] px-6 pb-28 pt-10 lg:px-10">
        <div className="grid items-start gap-14 md:grid-cols-[260px_1fr]">
          {/* Sticky sidebar – groups and items from the docs nav data */}
          <Reveal>
            <nav className="sticky top-[100px] flex flex-col gap-7 self-start">
              {DOCS_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink/45">
                    {group.label}
                  </div>
                  <div className="flex flex-col gap-[9px]">
                    {group.items.map((item) =>
                      item === ACTIVE_ITEM ? (
                        <a
                          key={item}
                          href="#"
                          className="text-[14.5px] font-semibold text-vermilion"
                        >
                          {item}
                        </a>
                      ) : (
                        <a
                          key={item}
                          href="#"
                          className="text-[14.5px] text-ink/70 transition-colors hover:text-vermilion"
                        >
                          {item}
                        </a>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </nav>
          </Reveal>

          {/* Article – kickoff & discovery */}
          <Reveal delay={120}>
            <div className="max-w-[720px] text-[17px] leading-[1.7] text-ink/80">
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
                GETTING STARTED
              </p>
              <h2
                className="mb-6 font-extrabold tracking-[-0.03em] text-ink"
                style={{ fontSize: "clamp(30px,3.6vw,44px)" }}
              >
                Kickoff &amp; discovery
              </h2>
              <p className="mb-6">
                Welcome to your platform. This playbook walks your team through everything from
                publishing a rapid-response page to reading the finance dashboard at 11pm on
                election night. Bookmark it — and know the war-room line is always open.
              </p>
              <p className="mb-6">
                Before the build begins, we run a discovery session to map your race, your list,
                your processor, and your deadlines. The output is a shared build calendar every
                stakeholder can see.
              </p>

              {/* Dark tip callout */}
              <div className="my-8 rounded-card bg-ink p-6 font-mono text-[13.5px] font-medium leading-[1.7] text-cream">
                <span className="text-vermilion">→ TIP</span>
                <br />
                Add your finance director and comms lead to the shared calendar on day one. Access
                delays are the number-one cause of a slipped launch.
              </div>

              <h3 className="mb-4 mt-9 text-[24px] font-bold tracking-[-0.02em] text-ink">
                What we need from you
              </h3>
              <ul className="mb-6 flex flex-col gap-2.5">
                {NEEDS.map((need) => (
                  <li key={need} className="flex gap-3">
                    <span className="text-vermilion">✳</span>
                    {need}
                  </li>
                ))}
              </ul>

              <p>
                Once those land, we schedule the kickoff and the clock starts. Next up:{" "}
                <a href="#" className="font-semibold text-vermilion">
                  Access &amp; credentials →
                </a>
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
