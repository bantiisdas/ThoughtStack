"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const components: Components = {
  p: ({ children }) => (
    <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[#1c1917]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#2f4f3a] underline underline-offset-2 hover:text-[#1f3a2b]"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-[#f5f5f4] px-1 py-0.5 font-mono text-[0.85em] text-[#292524]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-md border border-[#e7e5e4] bg-[#1c1917] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#f5f5f4] last:mb-0">
      {children}
    </pre>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 text-base font-semibold text-[#1c1917]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 text-sm font-semibold text-[#1c1917]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 text-sm font-semibold text-[#1c1917]">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-[#d6d3d1] pl-3 text-[#57534e] last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-[#e7e5e4]" />,
};

type Props = {
  content: string;
  className?: string;
};

export function MarkdownContent({ content, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
