export type SourceType = "PDF" | "TEXT" | "WEBSITE" | "YOUTUBE" | "VTT";

export type SourceStatus = "UPLOADING" | "INDEXING" | "READY" | "FAILED";

export type SourceSummary = {
  id: string;
  type: SourceType;
  title: string;
  status: SourceStatus;
  errorMessage: string | null;
  originalName: string | null;
  mimeType: string | null;
  url: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type Notebook = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { sources: number };
  sources?: SourceSummary[];
};
