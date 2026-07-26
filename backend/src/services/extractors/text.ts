import fs from "node:fs/promises";
import path from "node:path";
import type { ExtractedDocument } from "./types.js";

export async function extractText(storagePath: string): Promise<ExtractedDocument> {
  const absolute = path.resolve(process.cwd(), storagePath);
  const text = await fs.readFile(absolute, "utf8");
  if (!text.trim()) {
    throw new Error("Text file is empty");
  }

  return {
    text,
    metadata: { charCount: text.length },
  };
}
