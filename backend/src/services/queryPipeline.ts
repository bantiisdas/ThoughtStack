import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import type { Prisma, SourceType } from "@prisma/client";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { reciprocalRankFusion } from "../lib/rrf.js";
import { searchNotebookVectors } from "../lib/qdrant.js";
import type { ChunkLocator } from "./extractors/types.js";

const MAIN_MODEL = "gpt-4o-mini";
const SEARCH_TOP_K = 10;
const RRF_TOP_N = 5;
const MAX_ATTEMPTS = 3;
const PASS_SCORE = 6;

const planSchema = z.object({
  stepBackContext: z
    .string()
    .describe("Broader intent / topic the user actually wants"),
  rewrittenQuery: z
    .string()
    .describe("Retrieval-friendly rewrite with clean keywords"),
  subQueries: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("2–4 focused sub-questions for retrieval"),
});

const answerSchema = z.object({
  answer: z
    .string()
    .describe("Grounded markdown answer with [n] citation markers"),
  citations: z
    .array(z.number().int().positive())
    .describe("1-based context indices actually used"),
});

// OpenAI strict json_schema requires every property in `required` — no .optional().
const gradeSchema = z.object({
  score: z.number().min(0).max(10).describe("Answer quality 0–10"),
  feedback: z
    .string()
    .describe("Brief feedback; empty string if none"),
  relevantKeywords: z
    .array(z.string())
    .describe("Extra search keywords when score < 6; empty array otherwise"),
});

export type Citation = {
  citationId: string;
  sourceId: string;
  sourceType: SourceType;
  sourceTitle: string;
  chunkId: string;
  snippet: string;
  locator: ChunkLocator;
};

export type QueryMeta = {
  attempts: number;
  grade: number;
  grades: number[];
};

export type QueryPipelineResult = {
  answer: string;
  citations: Citation[];
  meta: QueryMeta;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
};

type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  text: string;
  locator: ChunkLocator;
  sourceType: SourceType;
  sourceTitle: string;
};

function requireOpenAiKey(): string {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for querying");
  }
  return env.OPENAI_API_KEY;
}

function getEmbeddings(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    apiKey: requireOpenAiKey(),
    model: "text-embedding-3-small",
  });
}

function getChat(temperature = 0): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: requireOpenAiKey(),
    model: MAIN_MODEL,
    temperature,
  });
}

function snippetFrom(text: string, max = 280): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function asLocator(value: unknown): ChunkLocator {
  if (!value || typeof value !== "object") return {};
  return value as ChunkLocator;
}

/** Step 1a–c: step-back + rewrite + sub-queries in one structured call. */
async function planQuery(question: string): Promise<z.infer<typeof planSchema>> {
  const llm = getChat(0).withStructuredOutput(planSchema, {
    name: "query_plan",
    strict: true,
  });

  const result = await llm.invoke([
    {
      role: "system",
      content: `You plan retrieval for a RAG system over a user's personal notebook sources.
Return:
- stepBackContext: the broader topic / underlying intent (not just surface wording)
- rewrittenQuery: cleaned, keyword-rich, retrieval-friendly rewrite
- subQueries: 2–4 focused sub-questions that together cover the ask`,
    },
    { role: "user", content: question },
  ]);

  const parsed = planSchema.parse(result);
  // Cap cost: at most 4 sub-queries.
  return {
    ...parsed,
    subQueries: parsed.subQueries.slice(0, 4),
  };
}

/** Step 1d: HyDE — 3–5 line hypothetical answer (embedding query only). */
async function generateHyDE(question: string): Promise<string> {
  const llm = getChat(0.3);
  const res = await llm.invoke([
    {
      role: "system",
      content: `Write a hypothetical answer of exactly 3–5 short lines based on general knowledge.
This text is only used as an embedding query to improve recall — keep it dense and topical.
Do not mention that it is hypothetical.`,
    },
    { role: "user", content: question },
  ]);
  const content =
    typeof res.content === "string" ? res.content : String(res.content ?? "");
  return content.trim();
}

/** Step 2: embed texts and run parallel notebook-scoped Qdrant searches. */
async function multiVectorSearch(
  notebookId: string,
  texts: string[],
): Promise<string[][]> {
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const embeddings = getEmbeddings();
  const vectors = await embeddings.embedDocuments(unique);

  const hitLists = await Promise.all(
    vectors.map((vector) =>
      searchNotebookVectors(notebookId, vector, SEARCH_TOP_K),
    ),
  );

  return hitLists.map((hits) => hits.map((h) => h.chunkId));
}

/** Load chunk + source metadata for fused ids (preserve RRF order). */
async function loadRetrievedChunks(
  notebookId: string,
  chunkIds: string[],
): Promise<RetrievedChunk[]> {
  if (chunkIds.length === 0) return [];

  const rows = await prisma.chunk.findMany({
    where: { notebookId, id: { in: chunkIds } },
    include: {
      source: { select: { id: true, type: true, title: true } },
    },
  });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: RetrievedChunk[] = [];

  for (const id of chunkIds) {
    const row = byId.get(id);
    if (!row) continue;
    ordered.push({
      chunkId: row.id,
      sourceId: row.sourceId,
      text: row.content,
      locator: asLocator(row.locator),
      sourceType: row.source.type,
      sourceTitle: row.source.title,
    });
  }

  return ordered;
}

/** Fallback when Qdrant returns nothing but Prisma has chunks. */
async function fallbackChunks(notebookId: string): Promise<RetrievedChunk[]> {
  const rows = await prisma.chunk.findMany({
    where: { notebookId },
    take: RRF_TOP_N,
    orderBy: { index: "asc" },
    include: {
      source: { select: { id: true, type: true, title: true } },
    },
  });

  return rows.map((row) => ({
    chunkId: row.id,
    sourceId: row.sourceId,
    text: row.content,
    locator: asLocator(row.locator),
    sourceType: row.source.type,
    sourceTitle: row.source.title,
  }));
}

function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] (source: ${c.sourceTitle})\n${c.text}`)
    .join("\n\n");
}

/** Step 4: grounded answer with [n] citations. */
async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
): Promise<z.infer<typeof answerSchema>> {
  if (chunks.length === 0) {
    return {
      answer:
        "I don't have enough indexed source material in this notebook to answer that yet.",
      citations: [],
    };
  }

  const llm = getChat(0).withStructuredOutput(answerSchema, {
    name: "grounded_answer",
    strict: true,
  });

  const result = await llm.invoke([
    {
      role: "system",
      content: `Answer ONLY using the numbered context passages.
Rules:
- If context is insufficient, say so explicitly.
- Cite claims with [n] markers matching context numbers.
- Prefer multiple citations when claims span sources.
- Do not invent facts outside the context.`,
    },
    {
      role: "user",
      content: `Question:\n${question}\n\nContext:\n${formatContext(chunks)}`,
    },
  ]);

  const parsed = answerSchema.parse(result);
  const valid = parsed.citations.filter(
    (n) => n >= 1 && n <= chunks.length,
  );
  // Always surface citations for UI — fall back to all context indices used.
  const citationNums =
    valid.length > 0
      ? [...new Set(valid)]
      : chunks.map((_, i) => i + 1);

  return { answer: parsed.answer, citations: citationNums };
}

/** Step 5: grade answer quality /10. */
async function gradeAnswer(
  question: string,
  answer: string,
  chunks: RetrievedChunk[],
): Promise<z.infer<typeof gradeSchema>> {
  const llm = getChat(0).withStructuredOutput(gradeSchema, {
    name: "answer_grade",
    strict: true,
  });

  const snippets = chunks
    .slice(0, 5)
    .map((c, i) => `[${i + 1}] ${snippetFrom(c.text, 160)}`)
    .join("\n");

  const result = await llm.invoke([
    {
      role: "system",
      content: `Grade how well the draft answers the user question using the retrieved context (0–10).
Score >= 6 means acceptable. If score < 6, provide relevantKeywords (2–6 short search terms) to improve retrieval.`,
    },
    {
      role: "user",
      content: `Question:\n${question}\n\nDraft answer:\n${answer}\n\nContext snippets:\n${snippets || "(none)"}`,
    },
  ]);

  return gradeSchema.parse(result);
}

function mapCitations(
  chunks: RetrievedChunk[],
  citationNums: number[],
): Citation[] {
  const nums =
    citationNums.length > 0
      ? [...new Set(citationNums)]
      : chunks.map((_, i) => i + 1);

  return nums
    .map((n) => {
      const chunk = chunks[n - 1];
      if (!chunk) return null;
      return {
        citationId: String(n),
        sourceId: chunk.sourceId,
        sourceType: chunk.sourceType,
        sourceTitle: chunk.sourceTitle,
        chunkId: chunk.chunkId,
        snippet: snippetFrom(chunk.text),
        locator: chunk.locator,
      } satisfies Citation;
    })
    .filter((c): c is Citation => c !== null);
}

async function resolveConversation(
  notebookId: string,
  conversationId?: string | null,
): Promise<{ id: string }> {
  if (conversationId) {
    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, notebookId },
      select: { id: true },
    });
    if (existing) return existing;
  }

  return prisma.conversation.create({
    data: {
      notebookId,
      title: null,
    },
    select: { id: true },
  });
}

/**
 * Advanced RAG query: plan → HyDE → multi-vector search → RRF → answer → grade/retry.
 */
export async function runQueryPipeline(input: {
  notebookId: string;
  question: string;
  conversationId?: string | null;
}): Promise<QueryPipelineResult> {
  const question = input.question.trim();
  if (!question) {
    throw new Error("Question is required");
  }

  const readyCount = await prisma.source.count({
    where: { notebookId: input.notebookId, status: "READY" },
  });
  if (readyCount === 0) {
    throw new Error("At least one READY source is required before asking");
  }

  const conversation = await resolveConversation(
    input.notebookId,
    input.conversationId,
  );

  const userMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: question,
    },
  });

  // Step 1: plan + HyDE (HyDE in parallel with plan).
  const [plan, hyde] = await Promise.all([
    planQuery(question),
    generateHyDE(question),
  ]);

  console.log(
    `[query] notebook=${input.notebookId} plan subQueries=${plan.subQueries.length}`,
  );

  let extraKeywords: string[] = [];
  let best: {
    answer: string;
    citations: Citation[];
    grade: number;
    attempt: number;
  } | null = null;
  const grades: number[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const queryTexts = [
      plan.stepBackContext,
      plan.rewrittenQuery,
      ...plan.subQueries,
      hyde,
      ...extraKeywords,
    ];

    // Steps 2–3: multi-vector search + RRF top 5.
    const rankedLists = await multiVectorSearch(input.notebookId, queryTexts);
    let fusedIds = reciprocalRankFusion(rankedLists, {
      k: 60,
      topN: RRF_TOP_N,
    });

    let chunks = await loadRetrievedChunks(input.notebookId, fusedIds);
    if (chunks.length === 0) {
      chunks = await fallbackChunks(input.notebookId);
    }

    // Step 4: grounded answer.
    const draft = await generateAnswer(question, chunks);
    const citations = mapCitations(chunks, draft.citations);

    // Assignment UX: never return an answer without citation chips when context exists.
    const finalCitations =
      citations.length > 0
        ? citations
        : mapCitations(
            chunks,
            chunks.map((_, i) => i + 1),
          );

    // Step 5: grade.
    const grade = await gradeAnswer(question, draft.answer, chunks);
    const score = Math.max(0, Math.min(10, Number(grade.score) || 0));
    grades.push(score);

    console.log(
      `[query] notebook=${input.notebookId} attempt=${attempt} grade=${score}`,
    );

    const candidate = {
      answer: draft.answer,
      citations: finalCitations,
      grade: score,
      attempt,
    };

    if (!best || score > best.grade) {
      best = candidate;
    }

    if (score >= PASS_SCORE) {
      best = candidate;
      break;
    }

    if (attempt < MAX_ATTEMPTS) {
      extraKeywords = (grade.relevantKeywords ?? [])
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 6);
      if (extraKeywords.length === 0) {
        // Still retry with rewritten terms if grader omitted keywords.
        extraKeywords = [plan.rewrittenQuery, ...plan.subQueries].slice(0, 4);
      }
    }
  }

  if (!best) {
    throw new Error("Query pipeline produced no answer");
  }

  const meta: QueryMeta = {
    attempts: best.attempt,
    grade: best.grade,
    grades,
  };

  const assistantMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: best.answer,
      citations: best.citations as unknown as Prisma.InputJsonValue,
      meta: meta as unknown as Prisma.InputJsonValue,
    },
  });

  // Touch conversation + notebook for list ordering.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: new Date(),
      title:
        question.length > 80 ? `${question.slice(0, 77)}…` : question,
    },
  });
  await prisma.notebook.update({
    where: { id: input.notebookId },
    data: { updatedAt: new Date() },
  });

  return {
    answer: best.answer,
    citations: best.citations,
    meta,
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
  };
}
