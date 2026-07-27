import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  PODCAST_MAX_WORD_COUNT,
  PODCAST_TARGET_WORD_COUNT,
} from "../config/limits.js";
import { prisma } from "../lib/prisma.js";

const MAIN_MODEL = "gpt-4o-mini";
/** Rough char budget for source context sent to the script LLM. */
const CONTEXT_CHAR_BUDGET = 28_000;

export type PodcastSpeaker = "host" | "guest";

export type PodcastTurn = {
  speaker: PodcastSpeaker;
  text: string;
};

export type PodcastScript = {
  title: string;
  turns: PodcastTurn[];
};

const scriptSchema = z.object({
  title: z
    .string()
    .describe("Short catchy podcast episode title"),
  turns: z
    .array(
      z.object({
        speaker: z
          .enum(["host", "guest"])
          .describe("host = male interviewer; guest = female expert"),
        text: z
          .string()
          .describe("Spoken dialogue for this turn; no stage directions"),
      }),
    )
    .min(4)
    .describe("Alternating host/guest conversation turns"),
});

function requireOpenAiKey(): string {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for podcast script generation");
  }
  return env.OPENAI_API_KEY;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function trimTurnsToWordCap(
  turns: PodcastTurn[],
  maxWords: number,
): PodcastTurn[] {
  const kept: PodcastTurn[] = [];
  let total = 0;
  for (const turn of turns) {
    const words = wordCount(turn.text);
    if (total + words > maxWords && kept.length >= 4) break;
    if (total + words > maxWords) {
      const remaining = Math.max(20, maxWords - total);
      const truncated = turn.text.split(/\s+/).slice(0, remaining).join(" ");
      if (truncated) kept.push({ ...turn, text: truncated });
      break;
    }
    kept.push(turn);
    total += words;
  }
  return kept;
}

/**
 * Build a budgeted plain-text context from all READY sources in a notebook.
 */
export async function buildNotebookContext(notebookId: string): Promise<{
  sourceIds: string[];
  context: string;
  notebookTitle: string;
}> {
  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId },
    select: { title: true },
  });
  if (!notebook) {
    throw new Error("Notebook not found");
  }

  const sources = await prisma.source.findMany({
    where: { notebookId, status: "READY" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      chunks: {
        orderBy: { index: "asc" },
        select: { content: true },
      },
    },
  });

  if (sources.length === 0) {
    throw new Error("No READY sources available for podcast generation");
  }

  const parts: string[] = [];
  let used = 0;

  for (const source of sources) {
    const header = `\n### Source: ${source.title} (${source.type})\n`;
    if (used + header.length > CONTEXT_CHAR_BUDGET) break;
    parts.push(header);
    used += header.length;

    for (const chunk of source.chunks) {
      const piece = `${chunk.content}\n`;
      if (used + piece.length > CONTEXT_CHAR_BUDGET) {
        const room = CONTEXT_CHAR_BUDGET - used;
        if (room > 80) {
          parts.push(piece.slice(0, room));
          used += room;
        }
        return {
          sourceIds: sources.map((s) => s.id),
          context: parts.join(""),
          notebookTitle: notebook.title,
        };
      }
      parts.push(piece);
      used += piece.length;
    }
  }

  return {
    sourceIds: sources.map((s) => s.id),
    context: parts.join(""),
    notebookTitle: notebook.title,
  };
}

/**
 * Generate a host (male) + guest (female) dialogue script grounded in notebook sources.
 */
export async function generatePodcastScript(
  notebookId: string,
): Promise<{ script: PodcastScript; sourceIds: string[] }> {
  const { sourceIds, context, notebookTitle } =
    await buildNotebookContext(notebookId);

  const llm = new ChatOpenAI({
    apiKey: requireOpenAiKey(),
    model: MAIN_MODEL,
    temperature: 0.7,
  }).withStructuredOutput(scriptSchema, {
    name: "podcast_script",
    strict: true,
  });

  const result = await llm.invoke([
    {
      role: "system",
      content: `You write short podcast scripts as a natural host/guest conversation.

Roles:
- host: curious male interviewer who asks clear questions and keeps the episode moving
- guest: knowledgeable female expert who explains ideas grounded ONLY in the provided sources

Rules:
- Target about ${PODCAST_TARGET_WORD_COUNT} spoken words total (roughly 4–5 minutes). Never exceed ${PODCAST_MAX_WORD_COUNT} words.
- Alternate speakers; start with the host welcoming listeners and introducing the topic.
- Conversational spoken English — short sentences, contractions, light reactions. No stage directions, timestamps, or speaker labels inside text.
- Do not invent facts beyond the sources. If sources are thin, keep the episode shorter rather than hallucinating.
- Cover the most important ideas from the materials; do not dump long quotes.`,
    },
    {
      role: "user",
      content: `Notebook title: ${notebookTitle}

Write a podcast episode from these sources:

${context}`,
    },
  ]);

  const turns = trimTurnsToWordCap(
    result.turns.map((t) => ({
      speaker: t.speaker as PodcastSpeaker,
      text: t.text.trim(),
    })),
    PODCAST_MAX_WORD_COUNT,
  );

  if (turns.length < 4) {
    throw new Error("Generated podcast script was too short");
  }

  return {
    sourceIds,
    script: {
      title: result.title.trim() || `${notebookTitle} Podcast`,
      turns,
    },
  };
}
