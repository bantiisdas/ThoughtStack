import { Router } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { deletePointsByNotebookId } from "../lib/qdrant.js";

export const notebooksRouter = Router();

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

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
} as const;

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

async function findOwnedNotebook(id: string, userId: string) {
  return prisma.notebook.findFirst({
    where: { id, userId },
  });
}

notebooksRouter.post(
  "/notebooks",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { title, description } = parsed.data;
    const notebook = await prisma.notebook.create({
      data: {
        userId: req.userId!,
        title,
        description: description ?? null,
      },
    });

    res.status(201).json({ notebook });
  },
);

notebooksRouter.get(
  "/notebooks",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const notebooks = await prisma.notebook.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { sources: true } },
      },
    });

    res.json({ notebooks });
  },
);

notebooksRouter.get(
  "/notebooks/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const notebook = await prisma.notebook.findFirst({
      where: { id, userId: req.userId },
      include: {
        sources: {
          orderBy: { createdAt: "desc" },
          select: sourceSelect,
        },
      },
    });

    if (!notebook) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    res.json({ notebook });
  },
);

notebooksRouter.patch(
  "/notebooks/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    if (
      parsed.data.title === undefined &&
      parsed.data.description === undefined
    ) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const existing = await findOwnedNotebook(paramId(req.params.id), req.userId!);
    if (!existing) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    const notebook = await prisma.notebook.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.title !== undefined
          ? { title: parsed.data.title }
          : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
      },
    });

    res.json({ notebook });
  },
);

notebooksRouter.delete(
  "/notebooks/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const existing = await findOwnedNotebook(paramId(req.params.id), req.userId!);
    if (!existing) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }

    try {
      await deletePointsByNotebookId(existing.id);
    } catch (error) {
      console.warn(
        `Qdrant cleanup failed for notebook ${existing.id}:`,
        error instanceof Error ? error.message : error,
      );
    }

    await prisma.notebook.delete({ where: { id: existing.id } });

    res.status(204).send();
  },
);
