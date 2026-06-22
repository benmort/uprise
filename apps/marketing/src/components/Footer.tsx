import Link from "next/link";
import { NewsletterSignup } from "./NewsletterSignup";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/plans", label: "Plans" },
      { href: "/request-demo", label: "Request a demo" },
      { href: "/integrations", label: "Integrations" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about-us", label: "About us" },
      { href: "/blog", label: "Blog" },
      { href: "/contact-us", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy-policy", label: "Privacy" },
      { href: "/terms-of-service", label: "Terms" },
      { href: "/security", label: "Security" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto grid w-full max-w-page gap-10 px-6 py-12 md:grid-cols-4">
        <div className="space-y-3">
          <p className="text-2xl font-extrabold tracking-tight">Foment</p>
          <p className="text-sm text-muted-foreground">SMS, WhatsApp, voice & canvassing for organisers.</p>
          <NewsletterSignup />
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{col.title}</h4>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-foreground hover:text-primary">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Foment. All rights reserved.
      </div>
    </footer>
  );
}
