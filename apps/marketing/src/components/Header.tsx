"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CircleIcon, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import MobileMenu from "./MobileMenu";
import { authAppUrl, adminAppUrl } from "@/lib/links";
import { useSession } from "@/lib/session";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { user } = useSession();
  const sessionHint = user?.email ? { email: user.email } : null;

  React.useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      setIsScrolled(scrollTop > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const headerClasses = isScrolled
    ? "fixed left-0 top-0 z-9999 w-full bg-white dark:bg-black-dark shadow transition duration-400"
    : "fixed left-0 top-0 z-9999 w-full bg-white transition duration-400";

  return (
    <header className={headerClasses}>
      <div className="relative items-center justify-between px-4 py-4 sm:px-8 xl:flex xl:gap-7 xl:px-12.5 xl:py-0 2xl:gap-0">
        <div className="flex w-full items-center justify-between xl:w-3/12">
          <div className="inline-flex items-center gap-1 z-[9999]">
            <Link aria-label="Uprise logo" href="/">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/uprise-icon.svg" alt="" className="h-8 w-8" />
                <span className="text-xl font-bold text-gray-900">Uprise</span>
              </div>
            </Link>

          </div>
          <div className="xl:hidden">
            <button
              className="ml-auto block p-2 cursor-pointer hover:bg-gray-100 rounded-lg transition-colors duration-200"
              type="button"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <span className="relative block h-6 w-6 z-[9999]">
                {/* Hamburger mobile menu icon */}
                <span className={`absolute right-0 block h-0.5 w-6 rounded-full bg-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'top-[13px] opacity-0' : 'top-[3px] opacity-100'}`}></span>
                <span className={`absolute right-0 block h-0.5 w-6 rounded-full bg-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'opacity-0' : 'top-[11px] opacity-100'}`}></span>
                <span className={`absolute right-0 block h-0.5 w-6 rounded-full bg-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'bottom-[13px] opacity-0' : 'bottom-[3px] opacity-100'}`}></span>
                {/* Cross/close mobile menu icon */}
                <span className={`absolute right-0 h-0.5 w-6 rounded-full bg-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'opacity-100 rotate-45 transform' : 'rotate-0 transform opacity-0'}`} style={{ top: '10px' }}></span>
                <span className={`absolute right-0 h-0.5 w-6 rounded-full bg-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'opacity-100 -rotate-45 transform' : 'rotate-0 transform opacity-0'}`} style={{ top: '10px' }}></span>
              </span>
            </button>
          </div>
        </div>

        <div className="invisible hidden h-0 w-full items-center justify-between lg:w-9/12 xl:visible xl:flex xl:h-auto 2xl:w-10/12">
          <nav>
            <ul className="flex flex-col gap-5 xl:flex-row xl:items-center 2xl:gap-8">
              <li className="nav__menu group xl:py-4">
                <Link className="font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white" href="/#channels">
                  Channels
                </Link>
              </li>
              <li className="nav__menu group xl:py-4">
                <Link className="font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white" href="/#features">
                  Features
                </Link>
              </li>
              <li className="nav__menu group relative xl:py-4">
                <button className="inline-flex items-center gap-1.5 font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white">
                  Resources
                  <span className="duration-200 xl:group-hover:-scale-100">
                    <ChevronDown className="h-5 w-5" />
                  </span>
                </button>
                <div className="invisible absolute left-[120%] top-full w-[270px] -translate-x-1/2 rounded-2xl border bg-white p-3 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100">
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/about-us">
                    About Us
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/blog">
                    Blog
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/plans">
                    Plans
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/for-campaigners">
                    For Campaigners
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/integrations">
                    Integrations
                  </Link>
                </div>
              </li>
              <li className="nav__menu group relative xl:py-4">
                <button className="inline-flex items-center gap-1.5 font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white">
                  Community
                  <span className="duration-200 xl:group-hover:-scale-100">
                    <ChevronDown className="h-5 w-5" />
                  </span>
                </button>
                <div className="invisible absolute left-[120%] top-full w-[270px] -translate-x-1/2 rounded-2xl border bg-white p-3 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100">
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/support-centre">
                    Support Centre
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/contact-us">
                    Contact Us
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/request-demo">
                    Request a Demo
                  </Link>
                </div>
              </li>
              <li className="nav__menu group relative xl:py-4">
                <button className="inline-flex items-center gap-1.5 font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white">
                  Policies
                  <span className="duration-200 xl:group-hover:-scale-100">
                    <ChevronDown className="h-5 w-5" />
                  </span>
                </button>
                <div className="invisible absolute left-[120%] top-full w-[270px] -translate-x-1/2 rounded-2xl border bg-white p-3 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100">
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/privacy-policy">
                    Privacy Policy
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/terms-of-service">
                    Terms of Service
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/security">
                    Security
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/compliance">
                    Compliance
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/donations-policy">
                    Donations Policy
                  </Link>
                </div>
              </li>
            </ul>
          </nav>

          <div className="mt-7 flex items-center gap-3 xl:mt-0">
            <div className="flex flex-col gap-3.5 xl:flex-row xl:items-center">
              {sessionHint ? (
                <div className="flex items-center gap-3 py-3">
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-stroke-tertiary bg-white px-4 py-3 text-sm font-medium text-text-color shadow-xs duration-200 hover:bg-gray-50 hover:text-gray-800 max-xl:h-13 max-xl:flex-1 max-xl:rounded-full"
                    href={`${authAppUrl()}/sign-in`}
                  >
                    Switch account
                  </a>
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white duration-200 max-xl:h-13 max-xl:flex-1 max-xl:rounded-full"
                    href={adminAppUrl()}
                  >
                    Continue as {sessionHint.email}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <>
                  <Link
                    href="/plans"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-[rgb(52,64,84)] px-4 py-3 text-sm font-medium text-white shadow-theme-xs duration-200 hover:bg-[#1e293b] max-xl:h-13 max-xl:w-full max-xl:rounded-full"
                  >
                    View Plans
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                  <div className="py-3">
                    <a
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white duration-200 max-xl:h-13 max-xl:w-full max-xl:rounded-full"
                      href={`${authAppUrl()}/sign-up`}
                    >
                      <span>
                        <CircleIcon className="h-5 w-5" />
                      </span>
                      Get Started
                    </a>
                  </div>
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-stroke-tertiary bg-white px-4 py-3 text-sm font-medium text-text-color shadow-xs duration-200 hover:bg-gray-50 hover:text-gray-800 max-xl:h-13 max-xl:w-full max-xl:rounded-full"
                    href={`${authAppUrl()}/sign-in`}
                  >
                    Login
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} sessionHint={sessionHint} />
    </header>
  );
}
