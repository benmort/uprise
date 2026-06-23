import React from "react";
import ReactMarkdown from "react-markdown";
import MermaidDiagram from "@/components/MermaidDiagram";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-3xl font-bold text-gray-900 mt-8 mb-4">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-4 text-gray-700 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc mb-4 ml-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal mb-4 ml-4">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="mb-1">{children}</li>
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-primary hover:opacity-80 underline">{children}</a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
          code: (props: any) => {
            const { inline, className: codeClassName, children, node, ...rest } = props;
            const language = codeClassName?.replace("language-", "");

            // Handle Mermaid diagrams
            if (language === "mermaid") {
              return (
                <MermaidDiagram
                  chart={String(children).trim()}
                  className="my-6 border border-gray-200 rounded-lg p-4 bg-white"
                />
              );
            }

            if (inline) {
              // Inline code
              return (
                <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...rest}>
                  {children}
                </code>
              );
            }

            // Code block
            return (
              <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4">
                <code className={codeClassName} {...rest}>
                  {children}
                </code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
