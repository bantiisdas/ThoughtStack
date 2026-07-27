/** Parse a YouTube video id from a watch/embed/shorts/youtu.be URL or bare id. */
export function extractYoutubeVideoId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").slice(0, 11);
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const embed = url.pathname.match(
        /\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/,
      );
      if (embed?.[1]) return embed[1];
    }
  } catch {
    // fall through
  }

  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1] ?? null;
}

export type YoutubeTranscriptCue = {
  text: string;
  offset: number;
  duration: number;
  lang?: string;
};

/** Fetch captions via the Next.js API route (avoids backend datacenter IP blocks). */
export async function fetchYoutubeTranscript(
  url: string,
): Promise<YoutubeTranscriptCue[]> {
  const res = await fetch("/api/youtube-transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const body = await res.text().catch(() => "");
  let message = body || `Request failed: ${res.status}`;
  let transcript: YoutubeTranscriptCue[] | undefined;

  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      transcript?: YoutubeTranscriptCue[];
    };
    if (parsed?.error) message = parsed.error;
    transcript = parsed?.transcript;
  } catch {
    // keep raw body
  }

  if (!res.ok) {
    throw new Error(message);
  }

  if (!transcript?.length) {
    throw new Error("YouTube transcript response was empty");
  }

  return transcript;
}

