import { fetchTranscript } from "youtube-transcript";
import { NextResponse } from "next/server";
import { extractYoutubeVideoId } from "@/lib/youtube";

export const runtime = "nodejs";

type TranscriptBody = {
  url?: string;
};

/**
 * POST /api/youtube-transcript
 * Fetches captions from the Next.js server (user/edge IP) so the backend
 * (datacenter) never calls YouTube directly.
 */
export async function POST(request: Request) {
  let body: TranscriptBody;
  try {
    body = (await request.json()) as TranscriptBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: "Could not parse YouTube video id from URL" },
      { status: 400 },
    );
  }

  try {
    const cues = await fetchTranscript(videoId);
    if (!cues.length) {
      return NextResponse.json(
        { error: `No captions found for YouTube video ${videoId}` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      videoId,
      transcript: cues.map((c) => ({
        text: c.text,
        offset: c.offset,
        duration: c.duration,
        ...(c.lang ? { lang: c.lang } : {}),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch YouTube transcript";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
