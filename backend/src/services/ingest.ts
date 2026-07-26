import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  deletePointsBySourceId,
  ensureQdrantCollection,
  upsertChunkPoints,
  type ChunkPointPayload,
} from "../lib/qdrant.js";

/** ~800–1000 tokens ≈ 3200–4000 chars; overlap ~150 tokens ≈ 600 chars. */
const CHUNK_SIZE = 3500;
const CHUNK_OVERLAP = 600;

export type TextLocator = {
  startChar: number;
  endChar: number;
};

async function extractTextSource(storagePath: string): Promise<string> {
  const absolute = path.resolve(process.cwd(), storagePath);
  const text = await fs.readFile(absolute, "utf8");
  if (!text.trim()) {
    throw new Error("Text file is empty");
  }
  return text;
}

function buildLocators(fullText: string, chunks: string[]): TextLocator[] {
  const locators: TextLocator[] = [];
  let cursor = 0;

  for (const chunk of chunks) {
    const idx = fullText.indexOf(chunk, cursor);
    const startChar = idx >= 0 ? idx : cursor;
    const endChar = startChar + chunk.length;
    locators.push({ startChar, endChar });
    cursor = endChar;
  }

  return locators;
}

function getEmbeddings(): OpenAIEmbeddings {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for indexing");
  }
  return new OpenAIEmbeddings({
    apiKey: env.OPENAI_API_KEY,
    model: "text-embedding-3-small",
  });
}

/**
 * Full ingest for a single source: extract → chunk → embed → Qdrant + Prisma.
 * Currently implements TEXT; other types throw until later phases.
 */
export async function indexSource(sourceId: string): Promise<void> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { status: "INDEXING", errorMessage: null },
  });

  try {
    if (source.type !== "TEXT") {
      throw new Error(
        `Indexing for source type ${source.type} is not implemented yet`,
      );
    }
    if (!source.storagePath) {
      throw new Error("Source has no storagePath");
    }

    await ensureQdrantCollection();

    // Clear any previous vectors/chunks (reindex-safe).
    await deletePointsBySourceId(sourceId);
    await prisma.chunk.deleteMany({ where: { sourceId } });

    const fullText = await extractTextSource(source.storagePath);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });

    const docs = await splitter.createDocuments(
      [fullText],
      [{ sourceId, notebookId: source.notebookId }],
    );

    if (docs.length === 0) {
      throw new Error("No chunks produced from text");
    }

    const chunkTexts = docs.map((d) => d.pageContent);
    const locators = buildLocators(fullText, chunkTexts);

    const createdChunks = await prisma.$transaction(
      docs.map((doc, index) =>
        prisma.chunk.create({
          data: {
            sourceId,
            notebookId: source.notebookId,
            index,
            content: doc.pageContent,
            locator: locators[index] as Prisma.InputJsonValue,
            qdrantPointId: randomUUID(),
          },
        }),
      ),
    );

    const embeddings = getEmbeddings();
    const vectors = await embeddings.embedDocuments(
      createdChunks.map((c) => c.content),
    );

    const points = createdChunks.map((chunk, i) => {
      const locator = chunk.locator as TextLocator | null;
      const payload: ChunkPointPayload = {
        notebookId: chunk.notebookId,
        sourceId: chunk.sourceId,
        chunkId: chunk.id,
        text: chunk.content,
        locator: locator ?? undefined,
      };
      return {
        id: chunk.qdrantPointId!,
        vector: vectors[i]!,
        payload,
      };
    });

    await upsertChunkPoints(points);

    const metadata: Prisma.InputJsonValue = {
      charCount: fullText.length,
      chunkCount: createdChunks.length,
    };

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "READY",
        errorMessage: null,
        metadata,
      },
    });

    console.log(
      `[ingest] Source ${sourceId} READY (${createdChunks.length} chunks)`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown indexing error";
    console.error(`[ingest] Source ${sourceId} FAILED:`, message);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 1000),
      },
    });

    throw error;
  }
}
