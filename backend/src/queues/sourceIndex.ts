import { Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";

export const SOURCE_INDEX_QUEUE = "source-index";

export type SourceIndexJobData = {
  sourceId: string;
};

let queue: Queue<SourceIndexJobData> | null = null;

export function getSourceIndexQueue(): Queue<SourceIndexJobData> {
  if (!queue) {
    queue = new Queue<SourceIndexJobData>(SOURCE_INDEX_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 3000,
        },
      },
    });
  }
  return queue;
}

export async function enqueueSourceIndex(sourceId: string): Promise<void> {
  await getSourceIndexQueue().add(
    "index",
    { sourceId },
    { jobId: `source-${sourceId}-${Date.now()}` },
  );
}
