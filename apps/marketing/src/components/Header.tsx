"use client";

import Link from "next/link";
import { Button, Logo } from "@yarns/ui";
import { authAppUrl } from "@/lib/links";

const NAV = [
  { href: "/plans", label: "Plans" },
  { href: "/request-demo", label: "Request a demo" },
  { href: "/contact-us", label: "Contact" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-page items-center justify-between px-6">
        <Link href="/" aria-label="Foment home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-sm font-medium text-foreground hover:text-primary">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href={`${authAppUrl()}/login`}>Log in</a>
          </Button>
          <Button size="sm" asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
