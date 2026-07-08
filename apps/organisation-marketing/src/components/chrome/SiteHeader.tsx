"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Work", href: "/work", activeOn: ["/work"] },
  { label: "Services", href: "/services", activeOn: ["/services"] },
  { label: "Pricing", href: "/pricing", activeOn: ["/pricing"] },
  { label: "Dispatch", href: "/dispatch", activeOn: ["/dispatch"] },
  { label: "About", href: "/about", activeOn: ["/about"] },
];

/** The dot + wordmark logo — pure text, no asset (per the design). */
export function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Uprise Labs — home">
      <span className="h-[11px] w-[11px] rounded-full bg-vermilion" aria-hidden />
      <span className={`text-[17px] font-extrabold tracking-[-0.02em] ${dark ? "text-cream" : "text-ink"}`}>
        Uprise Labs
      </span>
    </Link>
  );
}

/**
 * Fixed, blur-veiled header: wordmark, the five nav links (vermilion when their
 * route group is active — detail routes included via prefix match), Client login,
 * and the dark "Start a project ↗" pill.
 */
export function SiteHeader() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const isActive = (item: (typeof NAV)[number]) =>
    item.activeOn.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <header
      className="fixed inset-x-0 top-0 z-[900] border-b border-hairline backdrop-blur-[14px]"
      style={{ background: "rgba(243,240,233,0.72)" }}
    >
      <div className="mx-auto flex h-[72px] max-w-[1360px] items-center justify-between px-6 lg:px-10">
        <Wordmark />

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-[14.5px] font-medium transition-colors hover:text-vermilion ${
                isActive(item) ? "text-vermilion" : "text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <Link href="/sign-in" className="text-[14.5px] font-medium text-ink transition-colors hover:text-vermilion">
            Client login
          </Link>
          <Link
            href="/contact"
            className="rounded-pill bg-ink px-5 py-[11px] text-[14.5px] font-semibold text-cream transition-colors hover:bg-vermilion"
          >
            Start a project ↗
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle menu"
          className="font-mono text-xs uppercase tracking-[0.1em] lg:hidden"
        >
          {open ? "Close ✕" : "Menu ☰"}
        </button>
      </div>

      {open ? (
        <nav
          className="border-t border-hairline px-6 pb-6 pt-3 lg:hidden"
          style={{ background: "rgba(243,240,233,0.97)" }}
          aria-label="Mobile"
        >
          <ul className="space-y-1">
            {[...NAV, { label: "Client login", href: "/sign-in", activeOn: [] }, { label: "Start a project ↗", href: "/contact", activeOn: [] }].map(
              (item) => (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block py-2.5 text-lg font-semibold text-ink hover:text-vermilion"
                  >
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
