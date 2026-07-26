"use client";

import { extractYoutubeVideoId } from "@/lib/youtube";
import type { CitationLocator } from "@/lib/types";
import { TextHighlightViewer } from "./TextHighlightViewer";

type Props = {
  url: string | null;
  content: string;
  locator?: CitationLocator | null;
  snippet?: string | null;
  offsetsReliable?: boolean;
};

export function YoutubeViewer({
  url,
  content,
  locator,
  snippet,
  offsetsReliable = true,
}: Props) {
  const videoUrl = locator?.url || url;
  const videoId = videoUrl ? extractYoutubeVideoId(videoUrl) : null;
  const startSec =
    typeof locator?.startMs === "number"
      ? Math.floor(locator.startMs / 1000)
      : 0;

  const embedSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?start=${startSec}&rel=0`
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {embedSrc ? (
        <div className="aspect-video w-full shrink-0 overflow-hidden rounded-md border border-[#e7e5e4] bg-black">
          <iframe
            title="YouTube source"
            src={embedSrc}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <p className="text-sm text-[#78716c]">
          Could not parse a YouTube video id from this source.
          {videoUrl ? (
            <>
              {" "}
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#2f4f3a] hover:underline"
              >
                Open original
              </a>
            </>
          ) : null}
        </p>
      )}

      {content.trim() ? (
        <div className="min-h-0 flex-1">
          <TextHighlightViewer
            content={content}
            locator={locator}
            snippet={snippet}
            offsetsReliable={offsetsReliable}
            label="Transcript"
          />
        </div>
      ) : null}
    </div>
  );
}
