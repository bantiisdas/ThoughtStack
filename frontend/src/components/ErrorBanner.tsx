"use client";

type ErrorBannerProps = {
  message: string;
  onDismiss?: () => void;
  className?: string;
};

export function ErrorBanner({
  message,
  onDismiss,
  className = "",
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className}`}
    >
      <p className="min-w-0 flex-1 leading-snug">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
          aria-label="Dismiss error"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
