import { PDFParse } from "pdf-parse";
import { downloadObject } from "../../lib/storage.js";
import type { ExtractedDocument, ExtractedSegment } from "./types.js";

export async function extractPdf(storagePath: string): Promise<ExtractedDocument> {
  const data = await downloadObject(storagePath);

  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const pages = result.pages ?? [];

    const segments: ExtractedSegment[] = pages
      .map((page) => ({
        text: (page.text ?? "").trim(),
        locator: { page: page.num },
      }))
      .filter((s) => s.text.length > 0);

    const text =
      segments.length > 0
        ? segments.map((s) => s.text).join("\n\n")
        : (result.text ?? "").trim();

    if (!text) {
      throw new Error("PDF produced no extractable text (it may be image-only)");
    }

    return {
      text,
      segments: segments.length > 0 ? segments : undefined,
      metadata: {
        pageCount: pages.length || result.total || 0,
        charCount: text.length,
      },
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
