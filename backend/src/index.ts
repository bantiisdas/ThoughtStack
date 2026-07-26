import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "./config/env.js";
import { ensureQdrantCollection } from "./lib/qdrant.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { notebooksRouter } from "./routes/notebooks.js";
import { sourcesRouter } from "./routes/sources.js";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(clerkMiddleware());

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(healthRouter);
app.use("/api", meRouter);
app.use("/api", notebooksRouter);
app.use("/api", sourcesRouter);

app.get("/", (_req, res) => {
  res.json({
    name: "ThoughtStack API",
    version: "0.1.0",
    docs: "See README.md",
  });
});

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
