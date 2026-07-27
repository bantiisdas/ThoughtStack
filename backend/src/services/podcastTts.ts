import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { env } from "../config/env.js";
import type { PodcastTurn } from "./podcastScript.js";

/** ElevenLabs Text-to-Dialogue reliable request size. */
const MAX_BATCH_CHARS = 2000;

/** ~14 chars/sec spoken English at podcast pace. */
const CHARS_PER_SECOND = 14;

function requireElevenLabsKey(): string {
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error(
      "ELEVENLABS_API_KEY is required for podcast audio generation",
    );
  }
  return env.ELEVENLABS_API_KEY;
}

function voiceIdFor(speaker: PodcastTurn["speaker"]): string {
  return speaker === "host"
    ? env.ELEVENLABS_HOST_VOICE_ID
    : env.ELEVENLABS_GUEST_VOICE_ID;
}

export function estimateDurationSeconds(turns: PodcastTurn[]): number {
  const chars = turns.reduce((sum, t) => sum + t.text.length, 0);
  return Math.max(1, Math.round(chars / CHARS_PER_SECOND));
}

/**
 * Split dialogue turns into batches whose total text length stays under the
 * ElevenLabs Text-to-Dialogue character limit.
 */
export function batchTurns(turns: PodcastTurn[]): PodcastTurn[][] {
  const batches: PodcastTurn[][] = [];
  let current: PodcastTurn[] = [];
  let chars = 0;

  for (const turn of turns) {
    const len = turn.text.length;
    if (current.length > 0 && chars + len > MAX_BATCH_CHARS) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    // Single turn longer than the limit: still send alone (API may truncate).
    if (len > MAX_BATCH_CHARS && current.length === 0) {
      batches.push([turn]);
      continue;
    }
    current.push(turn);
    chars += len;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

async function audioResponseToBuffer(audio: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(audio)) return audio;
  if (audio instanceof Uint8Array) return Buffer.from(audio);

  if (audio && typeof audio === "object" && "arrayBuffer" in audio) {
    const blob = audio as Blob;
    return Buffer.from(await blob.arrayBuffer());
  }

  if (
    audio &&
    typeof (audio as ReadableStream<Uint8Array>).getReader === "function"
  ) {
    const reader = (audio as ReadableStream<Uint8Array>).getReader();
    const chunks: Buffer[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }

  // Node.js Readable / async iterable
  if (audio && Symbol.asyncIterator in Object(audio)) {
    const chunks: Buffer[] = [];
    for await (const chunk of audio as AsyncIterable<Uint8Array | Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unexpected ElevenLabs audio response type");
}

/**
 * Convert host/guest turns to a single MP3 via ElevenLabs Text-to-Dialogue.
 * Long scripts are split into ≤2k-char batches and concatenated.
 */
export async function synthesizePodcastAudio(
  turns: PodcastTurn[],
): Promise<{ audio: Buffer; durationSeconds: number }> {
  const client = new ElevenLabsClient({
    apiKey: requireElevenLabsKey(),
  });

  const batches = batchTurns(turns);
  const parts: Buffer[] = [];

  for (const batch of batches) {
    const audioStream = await client.textToDialogue.convert({
      inputs: batch.map((turn) => ({
        text: turn.text,
        voiceId: voiceIdFor(turn.speaker),
      })),
      outputFormat: "mp3_44100_128",
    });

    parts.push(await audioResponseToBuffer(audioStream));
  }

  return {
    audio: Buffer.concat(parts),
    durationSeconds: estimateDurationSeconds(turns),
  };
}
