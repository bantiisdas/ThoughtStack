import { createRequire } from "node:module";
import { downloadObjectText } from "../../lib/storage.js";
import type { ExtractedDocument, ExtractedSegment } from "./types.js";

const require = createRequire(import.meta.url);
const webvtt = require("node-webvtt") as {
  parse: (
    input: string,
    options?: { meta?: boolean; strict?: boolean },
  ) => {
    valid: boolean;
    cues: Array<{
      identifier: string;
      start: number;
      end: number;
      text: string;
      styles: string;
    }>;
  };
};

export async function extractVtt(
  storagePath: string,
): Promise<ExtractedDocument> {
  const raw = await downloadObjectText(storagePath);
  if (!raw.trim()) {
    throw new Error("VTT file is empty");
  }

  let parsed: ReturnType<typeof webvtt.parse>;
  try {
    parsed = webvtt.parse(raw, { strict: false });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse VTT";
    throw new Error(`Invalid VTT file: ${message}`);
  }

  const segments: ExtractedSegment[] = (parsed.cues ?? [])
    .map((cue) => {
      const text = (cue.text ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        text,
        locator: {
          startMs: Math.round(cue.start * 1000),
          endMs: Math.round(cue.end * 1000),
        },
      };
    })
    .filter((s) => s.text.length > 0);

  if (segments.length === 0) {
    throw new Error("VTT file has no caption cues");
  }

  const text = segments.map((s) => s.text).join("\n");
  const last = segments[segments.length - 1]!;

  return {
    text,
    segments,
    metadata: {
      cueCount: segments.length,
      durationMs: last.locator.endMs ?? null,
      charCount: text.length,
    },
  };
}
