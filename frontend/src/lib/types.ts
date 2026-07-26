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

export type CitationLocator = {
  page?: number;
  startChar?: number;
  endChar?: number;
  startMs?: number;
  endMs?: number;
  url?: string;
};

export type Citation = {
  citationId: string;
  sourceId: string;
  sourceType: SourceType;
  sourceTitle: string;
  chunkId: string;
  snippet: string;
  locator: CitationLocator;
};

export type QueryMeta = {
  attempts: number;
  grade: number;
  grades: number[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  citations: Citation[] | null;
  meta: QueryMeta | null;
  createdAt: string;
};

export type Conversation = {
  id: string;
  notebookId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type QueryResponse = {
  answer: string;
  citations: Citation[];
  meta: QueryMeta;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
};
