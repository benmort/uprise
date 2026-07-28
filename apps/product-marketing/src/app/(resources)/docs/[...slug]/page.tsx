import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";
import DocumentationLayout from "@/components/DocumentationLayout";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getAllHandbookDocs, getHandbookDoc, handbookNavigation } from "@/lib/handbook";

interface HandbookPageProps {
  params: Promise<{ slug: string[] }>;
}

/** Read a handbook page's markdown. Returns null when the file is missing so the route 404s
 *  rather than throwing – the registry and the directory are asserted to agree in the tests. */
function readHandbookMarkdown(slug: string): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "docs", "handbook", `${slug}.md`), "utf8");
  } catch (error) {
    console.error(`Error reading handbook document "${slug}":`, error);
    return null;
  }
}

export async function generateMetadata({ params }: HandbookPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getHandbookDoc((slug ?? []).join("/"));
  if (!doc) return {};
  return { title: `${doc.title} – Uprise handbook`, description: doc.description };
}

export default async function HandbookPage({ params }: HandbookPageProps) {
  const { slug } = await params;
  if (!slug || slug.length === 0) notFound();

  const doc = getHandbookDoc(slug.join("/"));
  if (!doc) notFound();

  const content = readHandbookMarkdown(doc.slug);
  if (content === null) notFound();

  return (
    <DocumentationLayout
      title={doc.title}
      description={doc.description}
      navigation={handbookNavigation()}
      exactMatchHrefs={["/docs"]}
    >
      <div className="mx-auto max-w-4xl">
        <MarkdownRenderer content={content} />
        <div className="mt-12 border-t border-gray-200 pt-6">
          <Link href="/docs" className="text-primary underline hover:opacity-80">
            ← All handbook pages
          </Link>
        </div>
      </div>
    </DocumentationLayout>
  );
}

/** Pre-render every registered page – the set is small, fixed, and known at build time. */
export function generateStaticParams() {
  return getAllHandbookDocs().map((doc) => ({ slug: [doc.slug] }));
}
