import { downloadObjectText } from "../../lib/storage.js";
import type { ExtractedDocument, ExtractedSegment } from "./types.js";

const YT_ID_RE =
  /(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export type YoutubeCue = {
  text: string;
  offset: number;
  duration: number;
};

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
  // Client libraries may return ms (InnerTube/srv3) or seconds (classic XML).
  if (cues.length === 0) return "ms";
  const allSmallDuration = cues.every((c) => c.duration < 100);
  const hasFractional = cues.some(
    (c) => !Number.isInteger(c.offset) || !Number.isInteger(c.duration),
  );
  return allSmallDuration || hasFractional ? "seconds" : "ms";
}

/** Build an ExtractedDocument from client-supplied caption cues. */
export function documentFromYoutubeCues(
  url: string,
  cues: YoutubeCue[],
): ExtractedDocument {
  const videoId = extractYoutubeVideoId(url);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

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

async function readStoredCues(storagePath: string): Promise<YoutubeCue[]> {
  let rawJson: string;
  try {
    rawJson = await downloadObjectText(storagePath);
  } catch {
    throw new Error(`Stored YouTube transcript missing at ${storagePath}`);
  }

  const raw = JSON.parse(rawJson) as unknown;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Stored YouTube transcript is empty or invalid");
  }

  return raw.map((item, index) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as YoutubeCue).text !== "string" ||
      typeof (item as YoutubeCue).offset !== "number" ||
      typeof (item as YoutubeCue).duration !== "number"
    ) {
      throw new Error(`Invalid cue at index ${index} in stored transcript`);
    }
    return item as YoutubeCue;
  });
}

/**
 * Extract from a client-uploaded transcript JSON file.
 * Live YouTube fetches are intentionally not done here (datacenter IPs are blocked).
 */
export async function extractYoutube(
  url: string,
  storagePath?: string | null,
): Promise<ExtractedDocument> {
  if (!storagePath) {
    throw new Error(
      "YouTube source has no stored transcript; re-add the video from the app",
    );
  }

  const cues = await readStoredCues(storagePath);
  return documentFromYoutubeCues(url, cues);
}
