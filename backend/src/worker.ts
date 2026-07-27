/**
 * BullMQ workers:
 * - `source-index` — extract → chunk → embed → Qdrant
 * - `podcast-generate` — LLM script → ElevenLabs TTS → Supabase
 *
 * Run alongside the API: `npm run worker`
 */
import "dotenv/config";
import { Worker } from "bullmq";
import { createRedisConnection } from "./lib/redis.js";
import { ensureQdrantCollection } from "./lib/qdrant.js";
import {
  SOURCE_INDEX_QUEUE,
  type SourceIndexJobData,
} from "./queues/sourceIndex.js";
import {
  PODCAST_GENERATE_QUEUE,
  type PodcastGenerateJobData,
} from "./queues/podcastGenerate.js";
import { indexSource } from "./services/ingest.js";
import { generatePodcast } from "./services/podcastGenerate.js";

async function main() {
  try {
    await ensureQdrantCollection();
  } catch (error) {
    console.warn(
      "Qdrant bootstrap skipped/failed (is docker-compose up?):",
      error instanceof Error ? error.message : error,
    );
  }

  const connection = createRedisConnection();

  const sourceWorker = new Worker<SourceIndexJobData>(
    SOURCE_INDEX_QUEUE,
    async (job) => {
      console.log(
        `[worker] Job ${job.id} indexing source ${job.data.sourceId}`,
      );
      await indexSource(job.data.sourceId);
    },
    {
      connection,
      concurrency: 2,
    },
  );

  const podcastWorker = new Worker<PodcastGenerateJobData>(
    PODCAST_GENERATE_QUEUE,
    async (job) => {
      console.log(
        `[worker] Job ${job.id} generating podcast ${job.data.podcastId}`,
      );
      await generatePodcast(job.data.podcastId);
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    },
  );

  for (const worker of [sourceWorker, podcastWorker]) {
    worker.on("completed", (job) => {
      console.log(`[worker] Job ${job.id} completed`);
    });
    worker.on("failed", (job, err) => {
      console.error(
        `[worker] Job ${job?.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    });
  }

  const shutdown = async () => {
    console.log("[worker] Shutting down…");
    await Promise.all([sourceWorker.close(), podcastWorker.close()]);
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log(
    `ThoughtStack worker listening on queues "${SOURCE_INDEX_QUEUE}", "${PODCAST_GENERATE_QUEUE}"`,
  );
}

main().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
