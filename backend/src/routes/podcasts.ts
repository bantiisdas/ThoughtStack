import { Router } from "express";
import {
  MAX_PODCASTS_PER_NOTEBOOK,
} from "../config/limits.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { podcastWriteLimiter } from "../middleware/rateLimit.js";
import { prisma } from "../lib/prisma.js";
import { deleteObject, downloadObject } from "../lib/storage.js";
import { enqueuePodcastGenerate } from "../queues/podcastGenerate.js";

export const podcastsRouter = Router();

const podcastSelect = {
  id: true,
  notebookId: true,
  title: true,
  status: true,
  errorMessage: true,
  script: true,
  mimeType: true,
  durationSeconds: true,
  sourceIds: true,
  createdAt: true,
  updatedAt: true,
} as const;

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

async function findOwnedNotebook(notebookId: string, userId: string) {
  return prisma.notebook.findFirst({
    where: { id: notebookId, userId },
    select: { id: true, title: true },
  });
}

async function findOwnedPodcast(podcastId: string, userId: string) {
  return prisma.podcast.findFirst({
    where: { id: podcastId, notebook: { userId } },
    select: {
      ...podcastSelect,
      storagePath: true,
    },
  });
}

/**
 * POST /api/notebooks/:id/podcasts — enqueue host/guest podcast from all READY sources.
 */
podcastsRouter.post(
  "/notebooks/:id/podcasts",
  requireAuth,
  podcastWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    const notebookId = paramId(req.params.id);
    const notebook = await findOwnedNotebook(notebookId, req.userId!);
    if (!notebook) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    const readyCount = await prisma.source.count({
      where: { notebookId, status: "READY" },
    });
    if (readyCount === 0) {
      res.status(400).json({
        error: "Add and index at least one source before generating a podcast",
      });
      return;
    }

    const inFlight = await prisma.podcast.count({
      where: {
        notebookId,
        status: { in: ["PENDING", "GENERATING"] },
      },
    });
    if (inFlight > 0) {
      res.status(409).json({
        error: "A podcast is already generating for this notebook",
      });
      return;
    }

    const total = await prisma.podcast.count({ where: { notebookId } });
    if (total >= MAX_PODCASTS_PER_NOTEBOOK) {
      res.status(400).json({
        error: `This notebook already has ${MAX_PODCASTS_PER_NOTEBOOK} podcasts (maximum). Delete one to generate another.`,
      });
      return;
    }

    const podcast = await prisma.podcast.create({
      data: {
        notebookId,
        title: `${notebook.title} Podcast`,
        status: "PENDING",
      },
      select: podcastSelect,
    });

    try {
      await enqueuePodcastGenerate(podcast.id);
    } catch (error) {
      console.error("[podcasts] enqueue failed:", error);
      await prisma.podcast.update({
        where: { id: podcast.id },
        data: {
          status: "FAILED",
          errorMessage: "Failed to enqueue podcast generation",
        },
      });
      res.status(500).json({ error: "Failed to enqueue podcast generation" });
      return;
    }

    res.status(201).json({ podcast });
  },
);

/**
 * GET /api/notebooks/:id/podcasts — list podcasts for a notebook.
 */
podcastsRouter.get(
  "/notebooks/:id/podcasts",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const notebookId = paramId(req.params.id);
    const notebook = await findOwnedNotebook(notebookId, req.userId!);
    if (!notebook) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    const podcasts = await prisma.podcast.findMany({
      where: { notebookId },
      orderBy: { createdAt: "desc" },
      select: podcastSelect,
    });

    res.json({ podcasts });
  },
);

/**
 * GET /api/podcasts/:id — podcast detail (includes script).
 */
podcastsRouter.get(
  "/podcasts/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const podcast = await findOwnedPodcast(id, req.userId!);
    if (!podcast) {
      res.status(404).json({ error: "Podcast not found" });
      return;
    }

    const { storagePath: _storagePath, ...publicPodcast } = podcast;
    res.json({ podcast: publicPodcast });
  },
);

/**
 * GET /api/podcasts/:id/audio — stream generated MP3.
 */
podcastsRouter.get(
  "/podcasts/:id/audio",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const podcast = await findOwnedPodcast(id, req.userId!);
    if (!podcast) {
      res.status(404).json({ error: "Podcast not found" });
      return;
    }

    if (podcast.status !== "READY" || !podcast.storagePath) {
      res.status(404).json({ error: "Podcast audio is not ready" });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadObject(podcast.storagePath);
    } catch (error) {
      console.error(`[podcasts] Supabase download failed for ${id}:`, error);
      res.status(404).json({ error: "Stored audio is missing in storage" });
      return;
    }

    const mime = podcast.mimeType || "audio/mpeg";
    const downloadName = `${podcast.title.replace(/[^\w\s-]/g, "").trim() || "podcast"}.mp3`;

    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${downloadName.replace(/"/g, "")}"`,
    );
    res.setHeader("Content-Length", String(fileBuffer.length));
    res.send(fileBuffer);
  },
);

/**
 * DELETE /api/podcasts/:id — delete podcast row + storage object.
 */
podcastsRouter.delete(
  "/podcasts/:id",
  requireAuth,
  podcastWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const podcast = await findOwnedPodcast(id, req.userId!);
    if (!podcast) {
      res.status(404).json({ error: "Podcast not found" });
      return;
    }

    if (podcast.status === "PENDING" || podcast.status === "GENERATING") {
      res.status(409).json({
        error: "Cannot delete a podcast while it is generating",
      });
      return;
    }

    if (podcast.storagePath) {
      try {
        await deleteObject(podcast.storagePath);
      } catch (error) {
        console.warn(
          `[podcasts] storage cleanup failed for ${id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    await prisma.podcast.delete({ where: { id } });
    res.status(204).send();
  },
);
