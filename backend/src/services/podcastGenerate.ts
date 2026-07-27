import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { deleteObject, objectKey, uploadObject } from "../lib/storage.js";
import { generatePodcastScript } from "./podcastScript.js";
import { synthesizePodcastAudio } from "./podcastTts.js";

/**
 * Full podcast pipeline: script (LLM) → TTS (ElevenLabs) → Supabase MP3.
 * Updates Podcast status along the way (mirrors source indexing).
 */
export async function generatePodcast(podcastId: string): Promise<void> {
  const podcast = await prisma.podcast.findUnique({
    where: { id: podcastId },
    select: { id: true, notebookId: true, storagePath: true },
  });

  if (!podcast) {
    throw new Error(`Podcast ${podcastId} not found`);
  }

  await prisma.podcast.update({
    where: { id: podcastId },
    data: {
      status: "GENERATING",
      errorMessage: null,
    },
  });

  try {
    const { script, sourceIds } = await generatePodcastScript(
      podcast.notebookId,
    );

    await prisma.podcast.update({
      where: { id: podcastId },
      data: {
        title: script.title,
        script: script as unknown as Prisma.InputJsonValue,
        sourceIds: sourceIds as unknown as Prisma.InputJsonValue,
      },
    });

    const { audio, durationSeconds } = await synthesizePodcastAudio(
      script.turns,
    );

    const key = objectKey(podcast.notebookId, `podcasts/${podcastId}.mp3`);

    // Replace any previous audio object for this podcast id.
    if (podcast.storagePath && podcast.storagePath !== key) {
      try {
        await deleteObject(podcast.storagePath);
      } catch {
        // Best-effort cleanup.
      }
    }

    await uploadObject(key, audio, "audio/mpeg");

    await prisma.podcast.update({
      where: { id: podcastId },
      data: {
        status: "READY",
        storagePath: key,
        mimeType: "audio/mpeg",
        durationSeconds,
        errorMessage: null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Podcast generation failed";
    console.error(`[podcast] Generation failed for ${podcastId}:`, error);

    await prisma.podcast.update({
      where: { id: podcastId },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 500),
      },
    });

    throw error;
  }
}
