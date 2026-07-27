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

export type SourceContentKind = "text" | "transcript" | "website" | "pdf";

export type SourceContentResponse = {
  source: {
    id: string;
    type: SourceType;
    title: string;
    url: string | null;
    mimeType: string | null;
    metadata: unknown;
    status: SourceStatus;
  };
  content: string;
  contentKind: SourceContentKind;
  offsetsReliable: boolean;
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

export type PodcastStatus = "PENDING" | "GENERATING" | "READY" | "FAILED";

export type PodcastSpeaker = "host" | "guest";

export type PodcastTurn = {
  speaker: PodcastSpeaker;
  text: string;
};

export type PodcastScript = {
  title: string;
  turns: PodcastTurn[];
};

export type PodcastSummary = {
  id: string;
  notebookId: string;
  title: string;
  status: PodcastStatus;
  errorMessage: string | null;
  script: PodcastScript | null;
  mimeType: string | null;
  durationSeconds: number | null;
  sourceIds: string[] | null;
  createdAt: string;
  updatedAt: string;
};
