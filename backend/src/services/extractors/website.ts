import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import type { ExtractedDocument } from "./types.js";

function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid website URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Website URL must use http or https");
  }
  return url.toString();
}

function fallbackTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, iframe").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text;
}

export async function extractWebsite(url: string): Promise<ExtractedDocument> {
  const normalized = normalizeUrl(url);

  const response = await fetch(normalized, {
    headers: {
      "User-Agent":
        "ThoughtStackBot/0.1 (+https://github.com/local/thoughtstack; educational RAG indexer)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml") &&
    !contentType.includes("text/plain")
  ) {
    throw new Error(`URL did not return HTML (content-type: ${contentType})`);
  }

  const html = await response.text();
  if (!html.trim()) {
    throw new Error("Website returned empty body");
  }

  let title: string | undefined;
  let text = "";

  try {
    const dom = new JSDOM(html, { url: normalized });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article?.textContent?.trim()) {
      text = article.textContent.replace(/\s+/g, " ").trim();
      title = article.title?.trim() || undefined;
    }
  } catch {
    // Fall through to cheerio cleanup.
  }

  if (!text) {
    text = fallbackTextFromHtml(html);
  }

  if (!text) {
    throw new Error("Could not extract readable text from website");
  }

  if (!title) {
    const $ = cheerio.load(html);
    title = $("title").first().text().trim() || undefined;
  }

  return {
    text,
    metadata: {
      url: normalized,
      title: title ?? null,
      charCount: text.length,
    },
  };
}
