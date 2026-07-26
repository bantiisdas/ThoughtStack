import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { env } from "../config/env.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { enqueueSourceIndex } from "../queues/sourceIndex.js";

export const sourcesRouter = Router();

const sourceSelect = {
  id: true,
  type: true,
  title: true,
  status: true,
  errorMessage: true,
  originalName: true,
  mimeType: true,
  url: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  notebookId: true,
} as const;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function isTextUpload(file: Express.Multer.File): boolean {
  const name = file.originalname.toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  return (
    name.endsWith(".txt") ||
    name.endsWith(".text") ||
    name.endsWith(".md") ||
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime.startsWith("text/")
  );
}

function titleFromFilename(originalName: string): string {
  const base = path.basename(originalName);
  const withoutExt = base.replace(/\.[^.]+$/, "");
  return (withoutExt || base).slice(0, 200);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

async function findOwnedNotebook(id: string, userId: string) {
  return prisma.notebook.findFirst({
    where: { id, userId },
  });
}

/**
 * POST /api/notebooks/:id/sources/upload
 * Multipart field `file` — Phase 2 supports TEXT (.txt / text/*).
 */
sourcesRouter.post(
  "/notebooks/:id/sources/upload",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    const notebookId = paramId(req.params.id);
    const notebook = await findOwnedNotebook(notebookId, req.userId!);
    if (!notebook) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Missing file field (multipart name: file)" });
      return;
    }

    if (!isTextUpload(file)) {
      res.status(400).json({
        error:
          "Only text files (.txt, .md, text/*) are supported in this phase. PDF and other types come next.",
      });
      return;
    }

    const title =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim().slice(0, 200)
        : titleFromFilename(file.originalname);

    const source = await prisma.source.create({
      data: {
        notebookId,
        type: "TEXT",
        title,
        status: "UPLOADING",
        originalName: file.originalname,
        mimeType: file.mimetype || "text/plain",
      },
      select: sourceSelect,
    });

    try {
      const notebookDir = path.resolve(
        process.cwd(),
        env.UPLOAD_DIR,
        notebookId,
      );
      fs.mkdirSync(notebookDir, { recursive: true });

      const safeName = file.originalname.replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const filename = `${source.id}-${safeName || "source.txt"}`;
      const absolutePath = path.join(notebookDir, filename);
      const storagePath = path
        .join(env.UPLOAD_DIR, notebookId, filename)
        .replace(/\\/g, "/");

      fs.writeFileSync(absolutePath, file.buffer);

      const updated = await prisma.source.update({
        where: { id: source.id },
        data: {
          storagePath,
          status: "INDEXING",
        },
        select: sourceSelect,
      });

      await enqueueSourceIndex(source.id);

      res.status(201).json({ source: updated });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save upload";
      await prisma.source.update({
        where: { id: source.id },
        data: { status: "FAILED", errorMessage: message.slice(0, 1000) },
      });
      res.status(500).json({ error: message });
    }
  },
);

/**
 * GET /api/sources/:id — status + metadata for polling.
 */
sourcesRouter.get(
  "/sources/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const source = await prisma.source.findFirst({
      where: {
        id,
        notebook: { userId: req.userId },
      },
      select: sourceSelect,
    });

    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    res.json({ source });
  },
);
