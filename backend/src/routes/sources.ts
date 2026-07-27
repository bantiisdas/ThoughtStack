import { Router } from "express";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import type { SourceType } from "@prisma/client";
import {
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  MAX_SOURCES_PER_NOTEBOOK,
} from "../config/limits.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sourceWriteLimiter } from "../middleware/rateLimit.js";
import { prisma } from "../lib/prisma.js";
import { deletePointsBySourceId } from "../lib/qdrant.js";
import {
  deleteObject,
  downloadObject,
  objectKey,
  uploadObject,
} from "../lib/storage.js";
import { enqueueSourceIndex } from "../queues/sourceIndex.js";
import {
  buildSegmentRanges,
  extractSource,
} from "../services/extractors/index.js";
import {
  extractYoutubeVideoId,
  type YoutubeCue,
} from "../services/extractors/youtube.js";

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

const youtubeCueSchema = z.object({
  text: z.string(),
  offset: z.number().finite(),
  duration: z.number().finite(),
  lang: z.string().optional(),
});

const urlBodySchema = z.object({
  type: z.enum(["WEBSITE", "YOUTUBE"]).optional(),
  url: z.string().trim().url("A valid URL is required"),
  title: z.string().trim().max(200).optional(),
  /** Required for YOUTUBE — fetched client-side (datacenter IPs are blocked). */
  transcript: z.array(youtubeCueSchema).min(1).max(50_000).optional(),
});

const reindexBodySchema = z.object({
  transcript: z.array(youtubeCueSchema).min(1).max(50_000).optional(),
});

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
    (mime.startsWith("text/") && !name.endsWith(".vtt"))
  );
}

function isPdfUpload(file: Express.Multer.File): boolean {
  const name = file.originalname.toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  return name.endsWith(".pdf") || mime === "application/pdf";
}

function isVttUpload(file: Express.Multer.File): boolean {
  const name = file.originalname.toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  return name.endsWith(".vtt") || mime === "text/vtt";
}

function detectUploadType(file: Express.Multer.File): SourceType | null {
  if (isPdfUpload(file)) return "PDF";
  if (isVttUpload(file)) return "VTT";
  if (isTextUpload(file)) return "TEXT";
  return null;
}

function titleFromFilename(originalName: string): string {
  const base = path.basename(originalName);
  const withoutExt = base.replace(/\.[^.]+$/, "");
  return (withoutExt || base).slice(0, 200);
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const leaf = parsed.pathname.split("/").filter(Boolean).pop();
    if (leaf) {
      return `${host}/${decodeURIComponent(leaf)}`.slice(0, 200);
    }
    return host.slice(0, 200);
  } catch {
    return "Untitled source";
  }
}

function looksLikeYoutube(url: string): boolean {
  try {
    extractYoutubeVideoId(url);
    return true;
  } catch {
    return false;
  }
}

function defaultMimeForType(type: SourceType): string {
  switch (type) {
    case "PDF":
      return "application/pdf";
    case "VTT":
      return "text/vtt";
    case "TEXT":
      return "text/plain";
    case "YOUTUBE":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

/** Persist client-fetched YouTube cues to Supabase Storage. */
async function persistYoutubeTranscript(
  notebookId: string,
  sourceId: string,
  cues: YoutubeCue[],
): Promise<string> {
  const filename = `${sourceId}-transcript.json`;
  const storagePath = objectKey(notebookId, filename);

  const normalized: YoutubeCue[] = cues.map((c) => ({
    text: c.text,
    offset: c.offset,
    duration: c.duration,
  }));

  await uploadObject(
    storagePath,
    Buffer.from(JSON.stringify(normalized), "utf8"),
    "application/json",
  );
  return storagePath;
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

async function findOwnedSource(id: string, userId: string) {
  return prisma.source.findFirst({
    where: {
      id,
      notebook: { userId },
    },
  });
}

async function assertUnderSourceCap(
  notebookId: string,
): Promise<string | null> {
  const count = await prisma.source.count({ where: { notebookId } });
  if (count >= MAX_SOURCES_PER_NOTEBOOK) {
    return `This notebook already has ${MAX_SOURCES_PER_NOTEBOOK} sources (maximum). Delete one to add another.`;
  }
  return null;
}

/**
 * POST /api/notebooks/:id/sources/upload
 * Multipart field `file` — TEXT (.txt/.md), PDF, or VTT.
 */
sourcesRouter.post(
  "/notebooks/:id/sources/upload",
  requireAuth,
  sourceWriteLimiter,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    const notebookId = paramId(req.params.id);
    const notebook = await findOwnedNotebook(notebookId, req.userId!);
    if (!notebook) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    const capError = await assertUnderSourceCap(notebookId);
    if (capError) {
      res.status(400).json({ error: capError });
      return;
    }

    const file = req.file;
    if (!file) {
      res
        .status(400)
        .json({ error: "Missing file field (multipart name: file)" });
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      res.status(413).json({
        error: `File too large. Maximum upload size is ${MAX_FILE_MB} MB.`,
      });
      return;
    }

    const type = detectUploadType(file);
    if (!type) {
      res.status(400).json({
        error:
          "Unsupported file type. Upload .txt/.md (TEXT), .pdf (PDF), or .vtt (VTT).",
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
        type,
        title,
        status: "UPLOADING",
        originalName: file.originalname,
        mimeType: file.mimetype || defaultMimeForType(type),
      },
      select: sourceSelect,
    });

    try {
      const safeName = file.originalname
        .replace(/[^\w.\-]+/g, "_")
        .slice(0, 80);
      const ext =
        type === "PDF"
          ? ".pdf"
          : type === "VTT"
            ? ".vtt"
            : path.extname(safeName) || ".txt";
      const filename = `${source.id}-${safeName || `source${ext}`}`;
      const storagePath = objectKey(notebookId, filename);
      const mime = file.mimetype || defaultMimeForType(type);

      await uploadObject(storagePath, file.buffer, mime);

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
 * POST /api/notebooks/:id/sources/url
 * Body: { type?: "WEBSITE" | "YOUTUBE", url, title?, transcript? }
 * YOUTUBE requires transcript cues fetched by the frontend.
 * Type is inferred from the URL when omitted.
 */
sourcesRouter.post(
  "/notebooks/:id/sources/url",
  requireAuth,
  sourceWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    const notebookId = paramId(req.params.id);
    const notebook = await findOwnedNotebook(notebookId, req.userId!);
    if (!notebook) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    const capError = await assertUnderSourceCap(notebookId);
    if (capError) {
      res.status(400).json({ error: capError });
      return;
    }

    const parsed = urlBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { url, title: titleInput, transcript } = parsed.data;
    let type = parsed.data.type;

    if (!type) {
      type = looksLikeYoutube(url) ? "YOUTUBE" : "WEBSITE";
    }

    if (type === "YOUTUBE" && !looksLikeYoutube(url)) {
      res.status(400).json({ error: "URL does not look like a YouTube video" });
      return;
    }

    if (type === "YOUTUBE" && (!transcript || transcript.length === 0)) {
      res.status(400).json({
        error:
          "YouTube sources require a transcript fetched by the client (transcript cues missing)",
      });
      return;
    }

    if (type === "WEBSITE") {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          res.status(400).json({ error: "Website URL must use http or https" });
          return;
        }
      } catch {
        res.status(400).json({ error: "Invalid website URL" });
        return;
      }
    }

    let normalizedUrl = url;
    let defaultTitle = titleFromUrl(url);

    if (type === "YOUTUBE") {
      const videoId = extractYoutubeVideoId(url);
      normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
      defaultTitle = `YouTube ${videoId}`;
    }

    const title = titleInput?.trim()
      ? titleInput.trim().slice(0, 200)
      : defaultTitle;

    try {
      const source = await prisma.source.create({
        data: {
          notebookId,
          type,
          title,
          url: normalizedUrl,
          mimeType: type === "YOUTUBE" ? "application/json" : null,
          status: type === "YOUTUBE" ? "UPLOADING" : "INDEXING",
        },
        select: sourceSelect,
      });

      if (type === "YOUTUBE" && transcript) {
        try {
          const storagePath = await persistYoutubeTranscript(
            notebookId,
            source.id,
            transcript,
          );
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
          return;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to save YouTube transcript";
          await prisma.source.update({
            where: { id: source.id },
            data: { status: "FAILED", errorMessage: message.slice(0, 1000) },
          });
          res.status(500).json({ error: message });
          return;
        }
      }

      await enqueueSourceIndex(source.id);
      res.status(201).json({ source });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create URL source";
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

function contentKindForType(
  type: SourceType,
): "text" | "transcript" | "website" | "pdf" {
  switch (type) {
    case "YOUTUBE":
    case "VTT":
      return "transcript";
    case "WEBSITE":
      return "website";
    case "PDF":
      return "pdf";
    default:
      return "text";
  }
}

async function loadSourceContentText(source: {
  id: string;
  type: SourceType;
  storagePath: string | null;
  url: string | null;
}): Promise<{ content: string; fromExtract: boolean }> {
  try {
    const extracted = await extractSource(source);
    const content = extracted.segments?.length
      ? buildSegmentRanges(extracted.segments).fullText
      : extracted.text;
    if (content.trim()) {
      return { content, fromExtract: true };
    }
  } catch (error) {
    console.warn(
      `[sources] Re-extract failed for ${source.id}, falling back to chunks:`,
      error instanceof Error ? error.message : error,
    );
  }

  const chunks = await prisma.chunk.findMany({
    where: { sourceId: source.id },
    orderBy: { index: "asc" },
    select: { content: true },
  });

  if (chunks.length === 0) {
    throw new Error("No content available for this source");
  }

  // Overlapping chunks — approximate body for display when re-extract fails.
  return {
    content: chunks.map((c) => c.content).join("\n\n"),
    fromExtract: false,
  };
}

/**
 * GET /api/sources/:id/content — text / transcript / extracted body for viewers.
 */
sourcesRouter.get(
  "/sources/:id/content",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const source = await findOwnedSource(id, req.userId!);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    try {
      const { content, fromExtract } = await loadSourceContentText(source);
      res.json({
        source: {
          id: source.id,
          type: source.type,
          title: source.title,
          url: source.url,
          mimeType: source.mimeType,
          metadata: source.metadata,
          status: source.status,
        },
        content,
        contentKind: contentKindForType(source.type),
        offsetsReliable: fromExtract,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load source content";
      res.status(500).json({ error: message });
    }
  },
);

/**
 * GET /api/sources/:id/file — serve stored binary from Supabase Storage.
 */
sourcesRouter.get(
  "/sources/:id/file",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const source = await findOwnedSource(id, req.userId!);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    if (!source.storagePath) {
      res.status(404).json({
        error: "This source has no stored file (URL-only sources)",
      });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadObject(source.storagePath);
    } catch (error) {
      console.error(`[sources] Supabase download failed for ${id}:`, error);
      res.status(404).json({ error: "Stored file is missing in storage" });
      return;
    }

    const mime = source.mimeType || defaultMimeForType(source.type);
    const downloadName =
      source.originalName ||
      `${source.title}${source.type === "PDF" ? ".pdf" : ""}`;

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
 * POST /api/sources/:id/reindex — clear vectors/chunks via worker and re-run ingest.
 * Body (optional): { transcript } — refresh stored YouTube cues before reindex.
 */
sourcesRouter.post(
  "/sources/:id/reindex",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const source = await findOwnedSource(id, req.userId!);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    if (source.status === "UPLOADING" || source.status === "INDEXING") {
      res.status(409).json({
        error: `Cannot reindex while source is ${source.status}`,
      });
      return;
    }

    const parsed = reindexBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { transcript } = parsed.data;

    if (source.type === "YOUTUBE") {
      if (transcript?.length) {
        try {
          const storagePath = await persistYoutubeTranscript(
            source.notebookId,
            source.id,
            transcript,
          );
          const updated = await prisma.source.update({
            where: { id },
            data: {
              storagePath,
              mimeType: "application/json",
              status: "INDEXING",
              errorMessage: null,
            },
            select: sourceSelect,
          });
          await enqueueSourceIndex(id);
          res.json({ source: updated });
          return;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to save YouTube transcript";
          res.status(500).json({ error: message });
          return;
        }
      }

      if (!source.storagePath) {
        res.status(400).json({
          error:
            "YouTube source has no stored transcript; provide transcript cues to reindex",
        });
        return;
      }
    }

    const updated = await prisma.source.update({
      where: { id },
      data: {
        status: "INDEXING",
        errorMessage: null,
      },
      select: sourceSelect,
    });

    await enqueueSourceIndex(id);

    res.json({ source: updated });
  },
);

/**
 * DELETE /api/sources/:id — remove file, DB rows, and Qdrant points.
 */
sourcesRouter.delete(
  "/sources/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const source = await findOwnedSource(id, req.userId!);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    try {
      await deletePointsBySourceId(id);
    } catch (error) {
      console.error(`[sources] Qdrant cleanup failed for ${id}:`, error);
      // Continue — DB delete should still proceed.
    }

    if (source.storagePath) {
      try {
        await deleteObject(source.storagePath);
      } catch (error) {
        console.error(`[sources] Storage cleanup failed for ${id}:`, error);
      }
    }

    await prisma.source.delete({ where: { id } });

    res.status(204).send();
  },
);
