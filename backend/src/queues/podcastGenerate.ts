import { Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";

export const PODCAST_GENERATE_QUEUE = "podcast-generate";

export type PodcastGenerateJobData = {
  podcastId: string;
};

let queue: Queue<PodcastGenerateJobData> | null = null;

export function getPodcastGenerateQueue(): Queue<PodcastGenerateJobData> {
  if (!queue) {
    queue = new Queue<PodcastGenerateJobData>(PODCAST_GENERATE_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    });
  }
  return queue;
}

export async function enqueuePodcastGenerate(podcastId: string): Promise<void> {
  await getPodcastGenerateQueue().add(
    "generate",
    { podcastId },
    { jobId: `podcast-${podcastId}-${Date.now()}` },
  );
}
