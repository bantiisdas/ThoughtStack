"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useState } from "react";
import { getSourceContent } from "@/lib/sources";
import type {
  Citation,
  CitationLocator,
  SourceContentResponse,
  SourceType,
} from "@/lib/types";
import { TextHighlightViewer } from "@/components/viewers/TextHighlightViewer";
import { WebsiteViewer } from "@/components/viewers/WebsiteViewer";
import { YoutubeViewer } from "@/components/viewers/YoutubeViewer";

const PdfViewer = dynamic(
  () =>
    import("@/components/viewers/PdfViewer").then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => <p className="text-sm text-[#78716c]">Loading PDF viewer…</p>,
  },
);

export type SourceViewerTarget = {
  sourceId: string;
  sourceType: SourceType;
  sourceTitle: string;
  citation?: Citation | null;
  /** Fallback URL when opening from the sources list (no citation). */
  url?: string | null;
};

type Props = {
  token: string;
  target: SourceViewerTarget;
  onClose: () => void;
};

function typeLabel(type: SourceType): string {
  switch (type) {
    case "PDF":
      return "PDF";
    case "YOUTUBE":
      return "YouTube";
    case "WEBSITE":
      return "Website";
    case "VTT":
      return "VTT transcript";
    default:
      return "Text";
  }
}

export function SourceViewer({ token, target, onClose }: Props) {
  const titleId = useId();
  const [payload, setPayload] = useState<SourceContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const locator: CitationLocator | null | undefined =
    target.citation?.locator;
  const snippet = target.citation?.snippet;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // PDF binary is loaded inside PdfViewer — no text content fetch needed.
      if (target.sourceType === "PDF") {
        setPayload(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setPayload(null);
      try {
        const data = await getSourceContent(token, target.sourceId);
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load source",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, target.sourceId, target.sourceType]);

  const sourceType = payload?.source.type ?? target.sourceType;
  const title = payload?.source.title ?? target.sourceTitle;
  const url = payload?.source.url ?? target.url ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#1c1917]/35"
      role="presentation"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex h-full w-full flex-col border-l border-[#e7e5e4] bg-white shadow-xl ${
          sourceType === "PDF" ? "max-w-3xl" : "max-w-xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#e7e5e4] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-wide text-[#78716c] uppercase">
              {typeLabel(sourceType)}
              {target.citation
                ? ` · citation [${target.citation.citationId}]`
                : ""}
            </p>
            <h2
              id={titleId}
              className="mt-0.5 truncate text-base font-semibold text-[#1c1917]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-[#d6d3d1] px-2.5 py-1 text-xs text-[#44403c] hover:bg-[#fafaf9]"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
          {loading ? (
            <p className="text-sm text-[#78716c]">Loading source…</p>
          ) : error && sourceType !== "PDF" ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : sourceType === "PDF" ? (
            <PdfViewer
              token={token}
              sourceId={target.sourceId}
              locator={locator}
              snippet={snippet}
            />
          ) : sourceType === "YOUTUBE" ? (
            payload ? (
              <YoutubeViewer
                url={url}
                content={payload.content}
                locator={locator}
                snippet={snippet}
                offsetsReliable={payload.offsetsReliable}
              />
            ) : (
              <p className="text-sm text-red-700">
                {error ?? "Failed to load transcript"}
              </p>
            )
          ) : sourceType === "WEBSITE" ? (
            payload ? (
              <WebsiteViewer
                content={payload.content}
                url={url}
                locator={locator}
                snippet={snippet}
                offsetsReliable={payload.offsetsReliable}
              />
            ) : (
              <p className="text-sm text-red-700">
                {error ?? "Failed to load website text"}
              </p>
            )
          ) : payload ? (
            <TextHighlightViewer
              content={payload.content}
              locator={locator}
              snippet={snippet}
              offsetsReliable={payload.offsetsReliable}
              label={sourceType === "VTT" ? "VTT transcript" : "Source text"}
            />
          ) : (
            <p className="text-sm text-red-700">
              {error ?? "Failed to load content"}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
