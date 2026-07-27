import { downloadObjectText } from "../../lib/storage.js";
import type { ExtractedDocument } from "./types.js";

export async function extractText(storagePath: string): Promise<ExtractedDocument> {
  const text = await downloadObjectText(storagePath);
  if (!text.trim()) {
    throw new Error("Text file is empty");
  }

  return {
    text,
    metadata: { charCount: text.length },
  };
}
