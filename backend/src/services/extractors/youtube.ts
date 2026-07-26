import { fetchTranscript } from "youtube-transcript";
import type { ExtractedDocument, ExtractedSegment } from "./types.js";

const YT_ID_RE =
  /(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYoutubeVideoId(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace(/^\//, "").slice(0, 11);
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch {
    // fall through to regex
  }

  const match = trimmed.match(YT_ID_RE);
  if (match?.[1]) return match[1];

  throw new Error("Could not parse YouTube video id from URL");
}

function normalizeCueTimes(
  cues: Array<{ offset: number; duration: number }>,
): "seconds" | "ms" {
  // youtube-transcript returns ms for InnerTube/srv3 and seconds for classic XML.
  if (cues.length === 0) return "ms";
  const allSmallDuration = cues.every((c) => c.duration < 100);
  const hasFractional = cues.some(
    (c) => !Number.isInteger(c.offset) || !Number.isInteger(c.duration),
  );
  return allSmallDuration || hasFractional ? "seconds" : "ms";
}

export async function extractYoutube(url: string): Promise<ExtractedDocument> {
  const videoId = extractYoutubeVideoId(url);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let cues: Array<{ text: string; offset: number; duration: number }>;
  try {
    cues = await fetchTranscript(videoId);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch YouTube transcript";
    throw new Error(`YouTube captions unavailable for ${videoId}: ${message}`);
  }

  if (!cues.length) {
    throw new Error(`No captions found for YouTube video ${videoId}`);
  }

  const unit = normalizeCueTimes(cues);
  const segments: ExtractedSegment[] = cues
    .map((cue) => {
      const startMs =
        unit === "seconds"
          ? Math.round(cue.offset * 1000)
          : Math.round(cue.offset);
      const durationMs =
        unit === "seconds"
          ? Math.round(cue.duration * 1000)
          : Math.round(cue.duration);
      const text = cue.text.replace(/\s+/g, " ").trim();
      return {
        text,
        locator: {
          startMs,
          endMs: startMs + Math.max(durationMs, 0),
          url: watchUrl,
        },
      };
    })
    .filter((s) => s.text.length > 0);

  if (segments.length === 0) {
    throw new Error(`YouTube transcript for ${videoId} was empty`);
  }

  const text = segments.map((s) => s.text).join("\n");
  const last = segments[segments.length - 1]!;

  return {
    text,
    segments,
    metadata: {
      videoId,
      url: watchUrl,
      cueCount: segments.length,
      durationMs: last.locator.endMs ?? null,
      charCount: text.length,
    },
  };
}
