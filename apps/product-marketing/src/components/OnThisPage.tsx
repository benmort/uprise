"use client";

import React, { useEffect, useState } from "react";

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface OnThisPageProps {
  className?: string;
}

export default function OnThisPage({ className = "" }: OnThisPageProps) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Extract headings from the page content
    const extractHeadings = () => {
      const content = document.querySelector("main");
      if (!content) return;

      const headingElements = content.querySelectorAll("h1, h2, h3, h4, h5, h6");
      const extractedHeadings: Heading[] = [];

      headingElements.forEach((heading, index) => {
        const level = parseInt(heading.tagName.charAt(1));
        const text = heading.textContent || "";
        const id = heading.id || `heading-${index}`;

        // Set id if it doesn't exist
        if (!heading.id) {
          heading.id = id;
        }

        extractedHeadings.push({ id, text, level });
      });

      setHeadings(extractedHeadings);
    };

    extractHeadings();

    // Update headings when content changes (for SPA navigation)
    const observer = new MutationObserver(extractHeadings);
    const mainContent = document.querySelector("main");
    if (mainContent) {
      observer.observe(mainContent, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Track which heading is currently in view
    const handleScroll = () => {
      const headingElements = headings.map((heading) =>
        document.getElementById(heading.id)
      ).filter(Boolean) as HTMLElement[];

      const scrollPosition = window.scrollY + 100;

      for (let i = headingElements.length - 1; i >= 0; i--) {
        const heading = headingElements[i];
        if (heading && heading.offsetTop <= scrollPosition) {
          setActiveId(heading.id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Call once to set initial active heading

    return () => window.removeEventListener("scroll", handleScroll);
  }, [headings]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <div className={`sticky top-8 ${className}`}>
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">On This Page</h3>
        <nav className="space-y-1">
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              className={`block text-sm transition-colors hover:text-blue-600 ${
                activeId === heading.id
                  ? "text-blue-600 font-medium"
                  : "text-gray-600"
              }`}
              style={{
                paddingLeft: `${(heading.level - 1) * 12}px`,
              }}
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById(heading.id);
                if (element) {
                  element.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }
              }}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
