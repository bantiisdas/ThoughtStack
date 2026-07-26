/**
 * BullMQ worker: processes `source-index` jobs (extract → chunk → embed → Qdrant).
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
import { indexSource } from "./services/ingest.js";

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

  const worker = new Worker<SourceIndexJobData>(
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

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[worker] Job ${job?.id} failed:`,
      err instanceof Error ? err.message : err,
    );
  });

  const shutdown = async () => {
    console.log("[worker] Shutting down…");
    await worker.close();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log(`ThoughtStack worker listening on queue "${SOURCE_INDEX_QUEUE}"`);
}

main().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
