import { apiFetch } from "./api";
import type { Conversation, QueryResponse } from "./types";

export async function queryNotebook(
  token: string,
  notebookId: string,
  data: { question: string; conversationId?: string | null },
) {
  return apiFetch<QueryResponse>(`/api/notebooks/${notebookId}/query`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getLatestConversation(token: string, notebookId: string) {
  return apiFetch<{ conversation: Conversation | null }>(
    `/api/notebooks/${notebookId}/conversation`,
    { token },
  );
}
