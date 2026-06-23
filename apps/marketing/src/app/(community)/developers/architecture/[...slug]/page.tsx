import React from "react";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";
import DocumentationLayout from "@/components/DocumentationLayout";
import MarkdownRenderer from "@/components/MarkdownRenderer";

// Define the architecture document structure
const architectureDocs = {
  "1-high-level-system-overview": {
    title: "High-Level System Overview",
    description: "Comprehensive overview of Yarns's purpose, goals, and architecture",
    filePath: "1-high-level-system-overview.md",
  },
  "2-system-component-diagram": {
    title: "System Component Diagram",
    description: "Visual representation of system components and their interactions",
    filePath: "2-system-component-diagram.md",
  },
  "3-component-descriptions": {
    title: "Component Descriptions",
    description: "Detailed descriptions of all services, clients, and infrastructure components",
    filePath: "3-component-descriptions.md",
  },
  "4-data-flow-request-lifecycle": {
    title: "Data Flow & Request Lifecycle",
    description: "End-to-end request flows and data processing patterns",
    filePath: "4-data-flow-request-lifecycle.md",
  },
  "5-technology-stack": {
    title: "Technology Stack",
    description: "Complete inventory of technologies used across the system",
    filePath: "5-technology-stack.md",
  },
  "6-service-communication-integration": {
    title: "Service Communication & Integration",
    description: "Protocols, API gateway patterns, and service integration strategies",
    filePath: "6-service-communication-integration.md",
  },
  "7-infrastructure-deployment-architecture": {
    title: "Infrastructure & Deployment Architecture",
    description: "Deployment strategies, containerization, and cloud infrastructure",
    filePath: "7-infrastructure-deployment-architecture.md",
  },
  "8-scalability-fault-tolerance": {
    title: "Scalability and Fault Tolerance",
    description: "Scaling strategies, fault tolerance mechanisms, and performance optimization",
    filePath: "8-scalability-fault-tolerance.md",
  },
  "9-security-architecture": {
    title: "Security Architecture",
    description: "Authentication, authorization, encryption, and security measures",
    filePath: "9-security-architecture.md",
  },
};

interface ArchitecturePageProps {
  params: Promise<{
    slug: string[];
  }>;
}

// Get architecture document content
async function getArchitectureContent(docKey: string): Promise<{ content: string; metadata: any } | null> {
  const docInfo = architectureDocs[docKey as keyof typeof architectureDocs];

  if (!docInfo) {
    return null;
  }

  try {
    // Read markdown file from docs directory
    const filePath = path.join(process.cwd(), "docs", "developers", "architecture", docInfo.filePath);
    const content = fs.readFileSync(filePath, "utf8");

    return {
      content,
      metadata: docInfo,
    };
  } catch (error) {
    console.error("Error reading architecture document:", error);
    return null;
  }
}

export default async function ArchitecturePage({ params }: ArchitecturePageProps) {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    notFound();
  }

  const docKey = slug.join("-");
  const document = await getArchitectureContent(docKey);

  if (!document) {
    notFound();
  }

  const { content, metadata } = document;

  return (
    <DocumentationLayout
      title={metadata.title}
      description={metadata.description}
    >
      <div className="max-w-4xl mx-auto">
        <MarkdownRenderer content={content} />
      </div>
    </DocumentationLayout>
  );
}

// Generate static params for all architecture documents. The keys are the
// single-segment slugs the sidebar links to (e.g. "1-high-level-system-overview"),
// so prerender them verbatim rather than splitting on "-".
export async function generateStaticParams() {
  return Object.keys(architectureDocs).map((key) => ({
    slug: [key],
  }));
}

// Generate metadata for each architecture page
export async function generateMetadata({ params }: ArchitecturePageProps) {
  const { slug } = await params;
  const docKey = slug.join("-");
  const docInfo = architectureDocs[docKey as keyof typeof architectureDocs];

  if (!docInfo) {
    return {
      title: "Architecture Documentation - Yarns",
    };
  }

  return {
    title: `${docInfo.title} - Yarns Architecture`,
    description: docInfo.description,
  };
}
