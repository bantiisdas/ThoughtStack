import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { qdrant } from "../lib/qdrant.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = {
    api: "ok",
    database: "error",
    qdrant: "error",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    await qdrant.getCollections();
    checks.qdrant = "ok";
  } catch {
    checks.qdrant = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});
