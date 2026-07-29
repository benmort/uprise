"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleIcon } from "lucide-react";
import OnThisPage from "@/components/OnThisPage";

export interface NavigationItem {
  title: string;
  href: string;
  children?: NavigationItem[];
}

interface DocumentationLayoutProps {
  children: React.ReactNode;
  /** Heading for this layout's own title bar – standalone mode only. Under the global
   *  marketing chrome (`siteChrome`) the page owns its heading, so it is omitted. */
  title?: string;
  description?: string;
  /** Sidebar sections. Defaults to the developer/architecture tree; the user handbook
   *  under /docs passes its own so both doc sets share this chrome. */
  navigation?: NavigationItem[];
  /** Hrefs that should only light up on an exact path match (section index pages).
   *  Everything else matches by prefix so a nested page keeps its parent highlighted. */
  exactMatchHrefs?: string[];
  /**
   * Render as part of the marketing site rather than as a standalone full-screen shell.
   *
   * The handbook under /docs sits inside MarketingChrome, so it drops the pieces that
   * duplicated the site header – this layout's own brand block and title bar, which the fixed
   * header covered anyway – and offsets the shell below that header. /developers is suppressed
   * from the global chrome (see MarketingChrome's BARE_PREFIXES) and keeps the standalone shell.
   */
  siteChrome?: boolean;
}

const architectureNavigation: NavigationItem[] = [
  {
    title: "Getting Started",
    href: "#getting-started",
    children: [
      { title: "Introduction", href: "/developers" },
    ],
  },
  {
    title: "Architecture Documentation",
    href: "#architecture",
    children: [
      { title: "1. High-Level System Overview", href: "/developers/architecture/1-high-level-system-overview" },
      { title: "2. System Component Diagram", href: "/developers/architecture/2-system-component-diagram" },
      { title: "3. Component Descriptions", href: "/developers/architecture/3-component-descriptions" },
      { title: "4. Data Flow & Request Lifecycle", href: "/developers/architecture/4-data-flow-request-lifecycle" },
      { title: "5. Technology Stack", href: "/developers/architecture/5-technology-stack" },
      { title: "6. Service Communication & Integration", href: "/developers/architecture/6-service-communication-integration" },
      { title: "7. Infrastructure & Deployment Architecture", href: "/developers/architecture/7-infrastructure-deployment-architecture" },
      { title: "8. Scalability and Fault Tolerance", href: "/developers/architecture/8-scalability-fault-tolerance" },
      { title: "9. Security Architecture", href: "/developers/architecture/9-security-architecture" },
    ],
  },
];

export default function DocumentationLayout({
  children,
  title,
  description,
  navigation,
  exactMatchHrefs,
  siteChrome = false,
}: DocumentationLayoutProps) {
  const navigationData = navigation ?? architectureNavigation;
  const exactHrefs = exactMatchHrefs ?? ["/developers"];
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Every section starts open – both doc sets are short enough that hiding half of the
  // tree behind a click costs more than it saves.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(navigationData.map((section) => section.title)),
  );
  const pathname = usePathname();

  const toggleSection = (sectionTitle: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionTitle)) {
      newExpanded.delete(sectionTitle);
    } else {
      newExpanded.add(sectionTitle);
    }
    setExpandedSections(newExpanded);
  };

  const isActiveLink = (href: string) => {
    if (exactHrefs.includes(href)) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  // Auto-expand sections based on current path
  useEffect(() => {
    const newExpanded = new Set(expandedSections);

    for (const section of navigationData) {
      if (section.children) {
        for (const item of section.children) {
          if (isActiveLink(item.href)) {
            newExpanded.add(section.title);
            break;
          }
        }
      }
    }

    if (newExpanded.size !== expandedSections.size) {
      setExpandedSections(newExpanded);
    }
  }, [pathname, expandedSections.size]);

  // The site header is 70px at xl (4.375rem – the CTA slot's reserved height) and 64px below it,
  // and it is fixed, so under the global chrome the whole shell starts below it and the two
  // sticky columns pin to the same line. pt-17.5 is the offset the marketing pages already use.
  const shellClasses = siteChrome
    ? "flex bg-gray-50 pt-17.5"
    : "min-h-screen bg-gray-50 flex";

  // Off-canvas on mobile, a pinned column on desktop. Under the site header the open drawer
  // starts below it (top-16 = the mobile header) rather than covering the page to the top edge.
  const sidebarPosition = isMobileMenuOpen
    ? siteChrome
      ? "fixed bottom-0 left-0 top-16 z-40"
      : "fixed inset-y-0 left-0 z-40"
    : siteChrome
      ? "hidden lg:sticky lg:top-17.5 lg:z-auto lg:block lg:h-[calc(100vh-4.375rem)] lg:self-start"
      : "hidden lg:block lg:relative lg:z-auto";

  return (
    <div className={shellClasses}>
      {/* Mobile menu button – below the site header when there is one, so the two don't overlap. */}
      <div
        className={`${isMobileMenuOpen ? "hidden" : "block"} lg:hidden fixed left-4 z-50 ${
          siteChrome ? "top-20" : "top-4"
        }`}
      >
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 bg-white rounded-md shadow-md border"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isMobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Sidebar */}
      <div className={`w-80 bg-white shadow-lg lg:shadow-none ${sidebarPosition}`}>
        <div className="flex flex-col h-full">
          {/* Logo/Brand – standalone only; under the site header the wordmark is already up there. */}
          {!siteChrome && (
            <div className="p-6 border-b h-20">
              <Link href="/" className="flex items-center gap-2">
                <CircleIcon className="h-8 w-8 text-primary" />
                <span className="font-bold text-xl text-gray-900">Uprise</span>
              </Link>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {navigationData.map((section) => (
              <div key={section.title}>
                {section.children && section.children.length > 0 ? (
                  // Parent section with children
                  <div>
                    <button
                      onClick={() => toggleSection(section.title)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
                    >
                      <span>{section.title}</span>
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          expandedSections.has(section.title) ? "rotate-90" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                    {expandedSections.has(section.title) && (
                      <div className="mt-1 ml-2 pl-3 border-l border-gray-200 space-y-1">
                        {section.children.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => {
                              if (window.innerWidth < 1024) {
                                setIsMobileMenuOpen(false);
                              }
                            }}
                            className={`block pl-4 pr-3 py-2 text-sm font-medium rounded-md transition-colors relative ${
                              isActiveLink(item.href)
                                ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                          >
                            <span className="relative z-10">{item.title}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  // Section without children
                  <Link
                    href={section.href}
                    className={`block px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
                      isActiveLink(section.href)
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {section.title}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Footer – the build version belongs to the developer docs, not the handbook. */}
          {!siteChrome && (
            <div className="p-6 border-t">
              <div className="text-xs text-gray-500">
                <p className="font-semibold">Current Version</p>
                <p>v1.0.0</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:ml-0">
        {/* Full width header – standalone only. Under the site header this bar was both a second
            navbar ("Back to site" duplicating the site nav) and invisible, sitting behind it. */}
        {!siteChrome && title && (
          <div className="top-0 bg-white border-b p-6 h-20 lg:px-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                {description && (
                  <p className="text-sm text-gray-500 mt-1">{description}</p>
                )}
              </div>
              <div className="hidden lg:flex items-center space-x-4">
                <Link
                  href="/"
                  className="px-3 py-2 text-sm font-medium rounded-md transition-colors text-gray-700 hover:bg-gray-100"
                >
                  Back to site
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex flex-1">
          {/* Main content */}
          <div className="flex-1">
            {/* Page content */}
            <main className="px-6 py-8 lg:px-8">
              {children}
            </main>
          </div>

          {/* Right sidebar - On This Page */}
          <div className="hidden xl:block w-64 h-full">
            <div className={`sticky p-6 h-full ${siteChrome ? "top-17.5" : "top-20 border-b"}`}>
              <OnThisPage className="w-full" stickyTop={siteChrome ? "top-24" : "top-8"} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile overlay – kept clear of the site header so it stays usable behind the drawer. */}
      {isMobileMenuOpen && (
        <div
          className={`fixed z-30 bg-black bg-opacity-50 ${
            siteChrome ? "bottom-0 left-0 right-0 top-16" : "inset-0"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
