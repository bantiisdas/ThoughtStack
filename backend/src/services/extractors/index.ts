import type { SourceType } from "@prisma/client";
import { extractPdf } from "./pdf.js";
import { extractText } from "./text.js";
import { extractVtt } from "./vtt.js";
import { extractWebsite } from "./website.js";
import { extractYoutube } from "./youtube.js";
import type { ChunkLocator, ExtractedDocument, ExtractedSegment } from "./types.js";

export type { ChunkLocator, ExtractedDocument, ExtractedSegment };

type SourceLike = {
  type: SourceType;
  storagePath: string | null;
  url: string | null;
};

export async function extractSource(source: SourceLike): Promise<ExtractedDocument> {
  switch (source.type) {
    case "TEXT": {
      if (!source.storagePath) throw new Error("TEXT source has no storagePath");
      return extractText(source.storagePath);
    }
    case "PDF": {
      if (!source.storagePath) throw new Error("PDF source has no storagePath");
      return extractPdf(source.storagePath);
    }
    case "VTT": {
      if (!source.storagePath) throw new Error("VTT source has no storagePath");
      return extractVtt(source.storagePath);
    }
    case "WEBSITE": {
      if (!source.url) throw new Error("WEBSITE source has no url");
      return extractWebsite(source.url);
    }
    case "YOUTUBE": {
      if (!source.url) throw new Error("YOUTUBE source has no url");
      return extractYoutube(source.url);
    }
    default: {
      const exhaustive: never = source.type;
      throw new Error(`Unsupported source type: ${exhaustive}`);
    }
  }
}

type SegmentRange = {
  start: number;
  end: number;
  locator: ChunkLocator;
};

/** Join segments with blank lines and track char ranges for locator mapping. */
export function buildSegmentRanges(segments: ExtractedSegment[]): {
  fullText: string;
  ranges: SegmentRange[];
} {
  const ranges: SegmentRange[] = [];
  const parts: string[] = [];
  let cursor = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (i > 0) {
      parts.push("\n\n");
      cursor += 2;
    }
    const start = cursor;
    const end = start + seg.text.length;
    ranges.push({ start, end, locator: seg.locator });
    parts.push(seg.text);
    cursor = end;
  }

  return { fullText: parts.join(""), ranges };
}

function buildCharLocators(
  fullText: string,
  chunks: string[],
): ChunkLocator[] {
  const locators: ChunkLocator[] = [];
  let cursor = 0;

  for (const chunk of chunks) {
    const idx = fullText.indexOf(chunk, cursor);
    const startChar = idx >= 0 ? idx : cursor;
    const endChar = startChar + chunk.length;
    locators.push({ startChar, endChar });
    cursor = endChar;
  }

  return locators;
}

function mergeLocators(
  startChar: number,
  endChar: number,
  ranges: SegmentRange[],
): ChunkLocator {
  const overlapping = ranges.filter(
    (r) => r.start < endChar && r.end > startChar,
  );

  if (overlapping.length === 0) {
    return { startChar, endChar };
  }

  const primary = overlapping.reduce((best, cur) => {
    const bestOverlap =
      Math.min(best.end, endChar) - Math.max(best.start, startChar);
    const curOverlap =
      Math.min(cur.end, endChar) - Math.max(cur.start, startChar);
    return curOverlap > bestOverlap ? cur : best;
  });

  const pages = overlapping
    .map((r) => r.locator.page)
    .filter((p): p is number => typeof p === "number");
  const startMsList = overlapping
    .map((r) => r.locator.startMs)
    .filter((v): v is number => typeof v === "number");
  const endMsList = overlapping
    .map((r) => r.locator.endMs)
    .filter((v): v is number => typeof v === "number");

  return {
    startChar,
    endChar,
    page: pages[0] ?? primary.locator.page,
    startMs: startMsList.length ? Math.min(...startMsList) : primary.locator.startMs,
    endMs: endMsList.length ? Math.max(...endMsList) : primary.locator.endMs,
    url: primary.locator.url,
  };
}

/**
 * Build per-chunk locators. Uses segment metadata (page / ms) when available,
 * always includes char offsets into the joined extracted text.
 */
export function buildChunkLocators(
  fullText: string,
  chunks: string[],
  segments?: ExtractedSegment[],
): ChunkLocator[] {
  const charLocators = buildCharLocators(fullText, chunks);

  if (!segments?.length) {
    return charLocators;
  }

  const { ranges } = buildSegmentRanges(segments);
  return charLocators.map((loc) =>
    mergeLocators(loc.startChar!, loc.endChar!, ranges),
  );
}
