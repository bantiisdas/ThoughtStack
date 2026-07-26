"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CitationLocator } from "@/lib/types";

type Props = {
  content: string;
  locator?: CitationLocator | null;
  snippet?: string | null;
  offsetsReliable?: boolean;
  label?: string;
};

function resolveHighlightRange(
  content: string,
  locator: CitationLocator | null | undefined,
  snippet: string | null | undefined,
  offsetsReliable: boolean,
): { start: number; end: number } | null {
  if (
    offsetsReliable &&
    typeof locator?.startChar === "number" &&
    typeof locator?.endChar === "number" &&
    locator.startChar >= 0 &&
    locator.endChar > locator.startChar &&
    locator.endChar <= content.length
  ) {
    return { start: locator.startChar, end: locator.endChar };
  }

  const needle = snippet?.trim();
  if (needle) {
    const idx = content.indexOf(needle);
    if (idx >= 0) {
      return { start: idx, end: idx + needle.length };
    }
    // Snippet may be truncated with ellipsis — try a shorter prefix.
    const prefix = needle.slice(0, Math.min(80, needle.length));
    if (prefix.length >= 20) {
      const pIdx = content.indexOf(prefix);
      if (pIdx >= 0) {
        return { start: pIdx, end: pIdx + prefix.length };
      }
    }
  }

  return null;
}

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TextHighlightViewer({
  content,
  locator,
  snippet,
  offsetsReliable = true,
  label = "Source text",
}: Props) {
  const markRef = useRef<HTMLElement>(null);

  const range = useMemo(
    () => resolveHighlightRange(content, locator, snippet, offsetsReliable),
    [content, locator, snippet, offsetsReliable],
  );

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [range?.start, range?.end, content]);

  const before = range ? content.slice(0, range.start) : content;
  const highlighted = range ? content.slice(range.start, range.end) : "";
  const after = range ? content.slice(range.end) : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#78716c]">
        <span>{label}</span>
        {typeof locator?.startMs === "number" ? (
          <span className="rounded border border-[#d6d3d1] bg-[#fafaf9] px-1.5 py-0.5">
            {formatMs(locator.startMs)}
            {typeof locator.endMs === "number"
              ? ` – ${formatMs(locator.endMs)}`
              : ""}
          </span>
        ) : null}
        {range ? (
          <span className="text-[#2f4f3a]">Cited passage highlighted</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[#e7e5e4] bg-[#fafaf9] px-3 py-3">
        <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-[#1c1917]">
          {before}
          {highlighted ? (
            <mark
              ref={markRef}
              className="rounded-sm bg-[#c5d6c8] px-0.5 text-[#1c1917]"
            >
              {highlighted}
            </mark>
          ) : null}
          {after}
        </pre>
      </div>
    </div>
  );
}
