import React from "react";
import Image from "next/image";
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
          // Body images. Markdown carries no dimensions, so the figure fixes a 16/9 box and
          // `fill` crops into it – every in-article image then sits on the same rhythm as the
          // cover above it. A markdown title (the "quoted" part of ![alt](src "title")) becomes
          // the visible caption; alt stays the accessible description.
          img: ({ src, alt, title }) => {
            if (typeof src !== "string" || src.length === 0) return null;
            return (
              <figure className="my-8">
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-gray-100">
                  <Image src={src} alt={alt ?? ""} fill sizes="(min-width: 768px) 800px, 100vw" className="object-cover" />
                </div>
                {title ? (
                  <figcaption className="mt-3 text-center text-sm text-gray-500">{title}</figcaption>
                ) : null}
              </figure>
            );
          },
          // react-markdown wraps a lone image in a <p>; that would nest a <figure> (and a div)
          // inside a <p>, which the HTML parser unnests and React warns about. Detect that case
          // and render the children bare.
          p: ({ children, node }) => {
            // Inspect the source node, not the rendered children: by the time children exist the
            // image is already our own component, so its element type is no longer "img".
            const kids = (node as any)?.children ?? [];
            const isLoneImage = kids.length === 1 && kids[0]?.tagName === "img";
            if (isLoneImage) return <>{children}</>;
            return <p className="mb-4 text-gray-700 leading-relaxed">{children}</p>;
          },
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
