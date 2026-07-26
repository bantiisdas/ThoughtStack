import type { SourceStatus } from "@/lib/types";

const STYLES: Record<SourceStatus, string> = {
  UPLOADING: "bg-amber-50 text-amber-800 ring-amber-200",
  INDEXING: "bg-sky-50 text-sky-800 ring-sky-200",
  READY: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  FAILED: "bg-red-50 text-red-800 ring-red-200",
};

const LABELS: Record<SourceStatus, string> = {
  UPLOADING: "Uploading",
  INDEXING: "Indexing",
  READY: "Ready",
  FAILED: "Failed",
};

export function SourceStatusBadge({ status }: { status: SourceStatus }) {
  const animate = status === "UPLOADING" || status === "INDEXING";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ring-1 ring-inset ${STYLES[status]}`}
    >
      {animate ? (
        <span
          className="inline-block size-1.5 animate-pulse rounded-full bg-current opacity-70"
          aria-hidden
        />
      ) : null}
      {LABELS[status]}
    </span>
  );
}
