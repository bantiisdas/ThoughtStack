export type ChunkLocator = {
  page?: number;
  startChar?: number;
  endChar?: number;
  startMs?: number;
  endMs?: number;
  url?: string;
};

export type ExtractedSegment = {
  text: string;
  locator: ChunkLocator;
};

export type ExtractedDocument = {
  text: string;
  metadata: Record<string, unknown>;
  /** Page/cue segments used to derive chunk locators after splitting. */
  segments?: ExtractedSegment[];
};
