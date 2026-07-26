import { Router } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { queryLimiter } from "../middleware/rateLimit.js";
import { prisma } from "../lib/prisma.js";
import {
  runQueryPipeline,
  type Citation,
  type QueryMeta,
} from "../services/queryPipeline.js";

export const queryRouter = Router();

const queryBodySchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(4000),
  conversationId: z.string().trim().min(1).optional().nullable(),
});

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

async function findOwnedNotebook(id: string, userId: string) {
  return prisma.notebook.findFirst({
    where: { id, userId },
    select: { id: true },
  });
}

type StoredMessage = {
  id: string;
  role: string;
  content: string;
  citations: Citation[] | null;
  meta: QueryMeta | null;
  createdAt: Date;
};

function serializeMessage(m: {
  id: string;
  role: string;
  content: string;
  citations: unknown;
  meta: unknown;
  createdAt: Date;
}): StoredMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    citations: (m.citations as Citation[] | null) ?? null,
    meta: (m.meta as QueryMeta | null) ?? null,
    createdAt: m.createdAt,
  };
}

/**
 * POST /notebooks/:id/query — run advanced RAG pipeline and persist Q&A.
 */
queryRouter.post(
  "/notebooks/:id/query",
  requireAuth,
  queryLimiter,
  async (req: AuthenticatedRequest, res) => {
    const parsed = queryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const notebookId = paramId(req.params.id);
    const notebook = await findOwnedNotebook(notebookId, req.userId!);
    if (!notebook) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    try {
      const result = await runQueryPipeline({
        notebookId,
        question: parsed.data.question,
        conversationId: parsed.data.conversationId,
      });

      res.json({
        answer: result.answer,
        citations: result.citations,
        meta: result.meta,
        conversationId: result.conversationId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Query failed";
      console.error(`[query] notebook=${notebookId}:`, message);

      if (
        message.includes("READY source") ||
        message.includes("OPENAI_API_KEY")
      ) {
        res.status(400).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  },
);

/**
 * GET /notebooks/:id/conversation — latest conversation + messages for chat replay.
 */
queryRouter.get(
  "/notebooks/:id/conversation",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const notebookId = paramId(req.params.id);
    const notebook = await findOwnedNotebook(notebookId, req.userId!);
    if (!notebook) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    const conversation = await prisma.conversation.findFirst({
      where: { notebookId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) {
      res.json({ conversation: null });
      return;
    }

    res.json({
      conversation: {
        id: conversation.id,
        notebookId: conversation.notebookId,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map(serializeMessage),
      },
    });
  },
);
