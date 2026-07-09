import type { Metadata } from "next";
import { Reveal } from "@/components/system/Reveal";
import { ContactForm } from "@/components/forms/ContactForm";
import { CONTACT } from "@/lib/data/site";

export const metadata: Metadata = {
  title: "Contact — Uprise Labs",
  description: "Start a project with Uprise Labs.",
};

/** One stacked sidebar block – mono label over a value. */
function SidebarBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.05em] text-ink/45">
        {label}
      </div>
      {children}
    </div>
  );
}

export default function ContactPage() {
  return (
    <main>
      {/* Hero – eyebrow + the big display headline */}
      <section className="mx-auto max-w-[1360px] px-6 pb-10 pt-40 lg:px-10">
        <Reveal>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            Contact / Start a project
          </p>
          <h1
            className="font-extrabold leading-[0.94] tracking-[-0.04em]"
            style={{ fontSize: "clamp(44px,7vw,104px)" }}
          >
            Let&rsquo;s talk.
          </h1>
        </Reveal>
      </section>

      {/* Form + contact sidebar */}
      <section className="mx-auto max-w-[1360px] px-6 pb-28 pt-10 lg:px-10">
        <div className="grid items-start gap-16 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <ContactForm />
          </Reveal>

          <Reveal delay={120}>
            <div className="flex flex-col gap-10">
              <SidebarBlock label="Email">
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="text-[22px] font-semibold tracking-[-0.01em] transition-colors hover:text-vermilion"
                >
                  {CONTACT.email}
                </a>
              </SidebarBlock>

              <SidebarBlock label="Rapid response (24/7)">
                <div className="text-[22px] font-semibold tracking-[-0.01em]">{CONTACT.phone}</div>
              </SidebarBlock>

              <SidebarBlock label="Based in">
                <div className="whitespace-pre-line font-mono text-sm leading-[2] text-ink/70">
                  {CONTACT.basedIn}
                </div>
              </SidebarBlock>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
