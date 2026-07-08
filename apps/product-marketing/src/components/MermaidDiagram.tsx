"use client";

import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  chart: string;
  id?: string;
  className?: string;
}

export default function MermaidDiagram({ chart, id, className = "" }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || isRendered) return;

    const renderDiagram = async () => {
      try {
        // Initialize mermaid if not already done
        if (!mermaid.mermaidAPI) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "default",
            securityLevel: "loose",
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
          });
        }

        const uniqueId = id || `mermaid-${Math.random().toString(36).substr(2, 9)}`;

        // Clear previous content
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        // Render the diagram
        const { svg } = await mermaid.render(uniqueId, chart);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setIsRendered(true);
          setError(null);
        }
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      }
    };

    renderDiagram();
  }, [chart, id, isRendered]);

  if (error) {
    return (
      <div className={`border border-red-200 bg-red-50 p-4 rounded-lg ${className}`}>
        <p className="text-red-600 text-sm font-medium">Diagram Error</p>
        <p className="text-red-500 text-xs mt-1">{error}</p>
        <details className="mt-2">
          <summary className="text-red-600 text-xs cursor-pointer">Show diagram source</summary>
          <pre className="text-xs text-gray-600 mt-2 p-2 bg-gray-100 rounded overflow-x-auto">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-diagram ${className}`}
      style={{ minHeight: "100px" }}
    />
  );
}
