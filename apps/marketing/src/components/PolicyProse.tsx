import React from "react";

/**
 * Presentational helpers for policy pages. Mirror the styling prog's
 * MarkdownRenderer applied to each element, so policy content renders as
 * static JSX (no markdown renderer dependency).
 */

export function PolicyProse({ children }: { children: React.ReactNode }) {
  return <div className="prose prose-lg max-w-none">{children}</div>;
}

export function PolicyH2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">{children}</h2>;
}

export function PolicyH3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">{children}</h3>;
}

export function PolicyP({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-gray-700 leading-relaxed">{children}</p>;
}

export function PolicyUl({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc mb-4 ml-4">{children}</ul>;
}

export function PolicyLi({ children }: { children: React.ReactNode }) {
  return <li className="mb-1">{children}</li>;
}

export function PolicyA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-brand-600 hover:text-brand-700 underline">
      {children}
    </a>
  );
}
