"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const OVERSCAN = 2;
/** Typical portrait PDF aspect (height / width). */
const PAGE_ASPECT = 1.414;
const PAGE_GAP = 12;

export function PdfViewer({ token, sourceId, locator, snippet }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(1);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(
    typeof locator?.page === "number" && locator.page > 0 ? locator.page : 1,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fitWidth, setFitWidth] = useState(720);
  const [scale, setScale] = useState(1);
  const [range, setRange] = useState({ start: 1, end: 3 });
  const didJump = useRef(false);

  const renderWidth = Math.max(240, Math.floor(fitWidth * scale));
  const pageSlotHeight = Math.floor(renderWidth * PAGE_ASPECT) + PAGE_GAP;

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    didJump.current = false;
  }, [locator?.page, sourceId]);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setFileUrl(null);
      setNumPages(0);
      setScale(1);
      didJump.current = false;
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

  // Fit page width to the scroll container so initial load has no horizontal bar.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      const pad = 24; // matches px-3 py-3
      const w = Math.floor(el.clientWidth - pad);
      if (w > 0) setFitWidth(w);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fileUrl, loading]);

  const updateVisibleFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || numPages <= 0 || pageSlotHeight <= 0) return;

    const scrollTop = el.scrollTop;
    const clientHeight = el.clientHeight;
    const page = Math.min(
      numPages,
      Math.max(1, Math.floor(scrollTop / pageSlotHeight) + 1),
    );
    setCurrentPage(page);

    const start = Math.max(
      1,
      Math.floor(scrollTop / pageSlotHeight) + 1 - OVERSCAN,
    );
    const end = Math.min(
      numPages,
      Math.ceil((scrollTop + clientHeight) / pageSlotHeight) + OVERSCAN,
    );
    setRange({ start, end });
  }, [numPages, pageSlotHeight]);

  useEffect(() => {
    updateVisibleFromScroll();
  }, [updateVisibleFromScroll, renderWidth]);

  // Jump to citation page once the document is ready.
  useEffect(() => {
    if (!numPages || didJump.current) return;
    const target =
      typeof locator?.page === "number" && locator.page > 0
        ? locator.page
        : 1;
    const el = scrollRef.current;
    if (!el) return;
    didJump.current = true;
    el.scrollTop = (target - 1) * pageSlotHeight;
    setCurrentPage(target);
    updateVisibleFromScroll();
  }, [numPages, locator?.page, pageSlotHeight, updateVisibleFromScroll]);

  // Keep the current page anchored when zoom / fit width changes slot height.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !numPages || !didJump.current) return;
    el.scrollTop = (currentPageRef.current - 1) * pageSlotHeight;
    updateVisibleFromScroll();
  }, [pageSlotHeight, numPages, updateVisibleFromScroll]);

  const pagesToRender = useMemo(() => {
    if (numPages <= 0) return [];
    const list: number[] = [];
    for (let p = range.start; p <= range.end; p++) list.push(p);
    return list;
  }, [numPages, range.start, range.end]);

  const scrollToPage = (page: number) => {
    const el = scrollRef.current;
    if (!el || numPages <= 0) return;
    const clamped = Math.min(numPages, Math.max(1, page));
    el.scrollTo({ top: (clamped - 1) * pageSlotHeight, behavior: "smooth" });
    setCurrentPage(clamped);
  };

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
          Page {currentPage}
          {numPages > 0 ? ` of ${numPages}` : ""}
          {typeof locator?.page === "number" ? " · jumped from citation" : ""}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.75, Math.round((s - 0.15) * 100) / 100))}
            disabled={scale <= 0.75}
            className="rounded border border-[#d6d3d1] bg-white px-2 py-1 text-[#1c1917] disabled:opacity-40"
            aria-label="Zoom out"
          >
            −
          </button>
            <span className="min-w-12 text-center tabular-nums">
              {Math.round(scale * 100)}%
            </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2, Math.round((s + 0.15) * 100) / 100))}
            disabled={scale >= 2}
            className="rounded border border-[#d6d3d1] bg-white px-2 py-1 text-[#1c1917] disabled:opacity-40"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setScale(1)}
            disabled={scale === 1}
            className="rounded border border-[#d6d3d1] bg-white px-2 py-1 text-[#1c1917] disabled:opacity-40"
          >
            Fit
          </button>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => scrollToPage(currentPage - 1)}
            className="rounded border border-[#d6d3d1] bg-white px-2 py-1 text-[#1c1917] disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={numPages > 0 && currentPage >= numPages}
            onClick={() => scrollToPage(currentPage + 1)}
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

      <div
        ref={scrollRef}
        onScroll={updateVisibleFromScroll}
        className={`min-h-0 flex-1 rounded-md border border-[#e7e5e4] bg-[#f5f5f4] ${
          scale > 1 ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"
        }`}
      >
        <Document
          file={fileUrl}
          loading={<p className="p-4 text-sm text-[#78716c]">Rendering…</p>}
          error={
            <p className="p-4 text-sm text-red-700">Failed to render PDF</p>
          }
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            const startPage =
              typeof locator?.page === "number" && locator.page > 0
                ? locator.page
                : 1;
            setRange({
              start: Math.max(1, startPage - OVERSCAN),
              end: Math.min(n, startPage + OVERSCAN + 2),
            });
          }}
        >
          <div
            className="relative py-3"
            style={{
              height: numPages > 0 ? numPages * pageSlotHeight : undefined,
              width: scale > 1 ? renderWidth + 24 : "100%",
              minWidth: "100%",
              paddingLeft: 12,
              paddingRight: 12,
            }}
          >
            {pagesToRender.map((pageNumber) => (
              <div
                key={pageNumber}
                className="absolute inset-x-0 flex justify-center"
                style={{
                  top: (pageNumber - 1) * pageSlotHeight,
                  height: pageSlotHeight - PAGE_GAP,
                }}
              >
                <Page
                  pageNumber={pageNumber}
                  width={renderWidth}
                  className="shadow-sm"
                  renderTextLayer
                  renderAnnotationLayer
                />
              </div>
            ))}
          </div>
        </Document>
      </div>
    </div>
  );
}
