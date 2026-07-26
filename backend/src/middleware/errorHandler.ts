import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { MAX_FILE_MB } from "../config/limits.js";

/** Map Multer / unexpected errors to JSON `{ error }` responses. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: `File too large. Maximum upload size is ${MAX_FILE_MB} MB.`,
      });
      return;
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      res.status(400).json({ error: "Upload a single file using the `file` field." });
      return;
    }
    res.status(400).json({ error: err.message || "Upload failed" });
    return;
  }

  console.error("Unhandled error:", err);
  const message =
    err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
};
