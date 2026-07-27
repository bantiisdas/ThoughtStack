import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "./config/env.js";
import { ensureQdrantCollection } from "./lib/qdrant.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { notebooksRouter } from "./routes/notebooks.js";
import { queryRouter } from "./routes/query.js";
import { sourcesRouter } from "./routes/sources.js";

const app = express();

// Trust Caddy / reverse-proxy X-Forwarded-* headers
app.set("trust proxy", 1);

const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  }),
);

console.log(`CORS allowed origins: ${corsOrigins.join(", ")}`);
// Transcript payloads for long YouTube videos can exceed 2mb.
app.use(express.json({ limit: "5mb" }));
app.use(clerkMiddleware());

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(healthRouter);
app.use("/api", meRouter);
app.use("/api", notebooksRouter);
app.use("/api", sourcesRouter);
app.use("/api", queryRouter);

app.get("/", (_req, res) => {
  res.json({
    name: "ThoughtStack API",
    version: "0.1.0",
    docs: "See README.md",
  });
});

app.use(errorHandler);

async function bootstrap() {
  try {
    await ensureQdrantCollection();
  } catch (error) {
    console.warn(
      "Qdrant bootstrap skipped/failed (is docker-compose up?):",
      error instanceof Error ? error.message : error,
    );
  }

  app.listen(env.PORT, () => {
    console.log(`ThoughtStack API listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
