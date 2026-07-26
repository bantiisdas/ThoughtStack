"use client";

import type { CitationLocator } from "@/lib/types";
import { TextHighlightViewer } from "./TextHighlightViewer";

type Props = {
  content: string;
  url: string | null;
  locator?: CitationLocator | null;
  snippet?: string | null;
  offsetsReliable?: boolean;
};

export function WebsiteViewer({
  content,
  url,
  locator,
  snippet,
  offsetsReliable = true,
}: Props) {
  const openUrl = locator?.url || url;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {openUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#2f4f3a] hover:underline"
          >
            Open original
          </a>
          <span className="truncate text-[#a8a29e]" title={openUrl}>
            {openUrl}
          </span>
        </div>
      ) : null}

      {openUrl ? (
        <div className="hidden h-48 shrink-0 overflow-hidden rounded-md border border-[#e7e5e4] bg-white sm:block">
          <iframe
            title="Website preview"
            src={openUrl}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <TextHighlightViewer
          content={content}
          locator={locator}
          snippet={snippet}
          offsetsReliable={offsetsReliable}
          label="Extracted page text"
        />
      </div>
    </div>
  );
}
