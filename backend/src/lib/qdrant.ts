import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../config/env.js";

export const QDRANT_COLLECTION = "thoughtstack";
export const EMBEDDING_DIMENSIONS = 1536;

export const qdrant = new QdrantClient({ url: env.QDRANT_URL });

export async function ensureQdrantCollection(): Promise<void> {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === QDRANT_COLLECTION,
  );

  if (exists) {
    return;
  }

  await qdrant.createCollection(QDRANT_COLLECTION, {
    vectors: {
      size: EMBEDDING_DIMENSIONS,
      distance: "Cosine",
    },
  });

  await qdrant.createPayloadIndex(QDRANT_COLLECTION, {
    field_name: "notebookId",
    field_schema: "keyword",
  });

  await qdrant.createPayloadIndex(QDRANT_COLLECTION, {
    field_name: "sourceId",
    field_schema: "keyword",
  });

  console.log(`Created Qdrant collection "${QDRANT_COLLECTION}"`);
}

export type ChunkPointPayload = {
  notebookId: string;
  sourceId: string;
  chunkId: string;
  text: string;
  locator?: {
    page?: number;
    startChar?: number;
    endChar?: number;
    startMs?: number;
    endMs?: number;
    url?: string;
  };
};

/** Delete all vector points belonging to a notebook (isolation cleanup). */
export async function deletePointsByNotebookId(
  notebookId: string,
): Promise<void> {
  await qdrant.delete(QDRANT_COLLECTION, {
    wait: true,
    filter: {
      must: [
        {
          key: "notebookId",
          match: { value: notebookId },
        },
      ],
    },
  });
}

/** Delete all vector points belonging to a source (reindex / delete cleanup). */
export async function deletePointsBySourceId(sourceId: string): Promise<void> {
  await qdrant.delete(QDRANT_COLLECTION, {
    wait: true,
    filter: {
      must: [
        {
          key: "sourceId",
          match: { value: sourceId },
        },
      ],
    },
  });
}

export async function upsertChunkPoints(
  points: Array<{
    id: string;
    vector: number[];
    payload: ChunkPointPayload;
  }>,
): Promise<void> {
  if (points.length === 0) return;

  await qdrant.upsert(QDRANT_COLLECTION, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });
}

export type NotebookSearchHit = {
  chunkId: string;
  score: number;
  payload: ChunkPointPayload;
};

/**
 * Similarity search filtered to a single notebook (KB isolation).
 */
export async function searchNotebookVectors(
  notebookId: string,
  vector: number[],
  limit = 10,
): Promise<NotebookSearchHit[]> {
  const results = await qdrant.search(QDRANT_COLLECTION, {
    vector,
    limit,
    with_payload: true,
    filter: {
      must: [
        {
          key: "notebookId",
          match: { value: notebookId },
        },
      ],
    },
  });

  const hits: NotebookSearchHit[] = [];
  for (const point of results) {
    const payload = point.payload as ChunkPointPayload | null | undefined;
    if (!payload?.chunkId) continue;
    hits.push({
      chunkId: payload.chunkId,
      score: point.score ?? 0,
      payload,
    });
  }
  return hits;
}
