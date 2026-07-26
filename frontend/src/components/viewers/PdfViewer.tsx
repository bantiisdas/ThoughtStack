"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getSourceFileBlob } from "@/lib/sources";
import type { CitationLocator } from "@/lib/types";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Props = {
  token: string;
  sourceId: string;
  locator?: CitationLocator | null;
  snippet?: string | null;
};

export function PdfViewer({ token, sourceId, locator, snippet }: Props) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(
    typeof locator?.page === "number" && locator.page > 0 ? locator.page : 1,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(480);

  useEffect(() => {
    if (typeof locator?.page === "number" && locator.page > 0) {
      setPage(locator.page);
    }
  }, [locator?.page, sourceId]);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setFileUrl(null);
      try {
        const blob = await getSourceFileBlob(token, sourceId);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setFileUrl(url);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [token, sourceId]);

  useEffect(() => {
    function updateWidth() {
      const w = Math.min(640, Math.max(280, window.innerWidth - 64));
      setWidth(w);
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  if (loading) {
    return <p className="text-sm text-[#78716c]">Loading PDF…</p>;
  }

  if (error || !fileUrl) {
    return (
      <p className="text-sm text-red-700">{error ?? "PDF unavailable"}</p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#78716c]">
        <span>
          Page {page}
          {numPages > 0 ? ` of ${numPages}` : ""}
          {typeof locator?.page === "number" ? " · jumped from citation" : ""}
        </span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-[#d6d3d1] bg-white px-2 py-1 text-[#1c1917] disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={numPages > 0 && page >= numPages}
            onClick={() =>
              setPage((p) => (numPages > 0 ? Math.min(numPages, p + 1) : p + 1))
            }
            className="rounded border border-[#d6d3d1] bg-white px-2 py-1 text-[#1c1917] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {snippet ? (
        <p className="rounded-md border border-[#e7e5e4] bg-[#f5f5f4] px-2 py-1.5 text-xs leading-snug text-[#44403c]">
          <span className="font-medium text-[#2f4f3a]">Cited: </span>
          {snippet}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[#e7e5e4] bg-[#f5f5f4]">
        <Document
          file={fileUrl}
          loading={<p className="p-4 text-sm text-[#78716c]">Rendering…</p>}
          error={
            <p className="p-4 text-sm text-red-700">Failed to render PDF</p>
          }
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        >
          <Page
            pageNumber={page}
            width={width}
            className="mx-auto"
            renderTextLayer
            renderAnnotationLayer
          />
        </Document>
      </div>
    </div>
  );
}
