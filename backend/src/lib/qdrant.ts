import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../config/env.js";

export const QDRANT_COLLECTION = "thoughtstack";
export const EMBEDDING_DIMENSIONS = 1536;

export const qdrant = new QdrantClient({ url: env.QDRANT_URL });

export async function ensureQdrantCollection(): Promise<void> {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === QDRANT_COLLECTION);

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

/** Delete all vector points belonging to a notebook (isolation cleanup). */
export async function deletePointsByNotebookId(notebookId: string): Promise<void> {
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
