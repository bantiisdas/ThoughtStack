import { apiFetch } from "./api";
import type { SourceSummary, SourceType } from "./types";

export async function uploadSourceFile(
  token: string,
  notebookId: string,
  file: File,
  title?: string,
) {
  const form = new FormData();
  form.append("file", file);
  if (title?.trim()) {
    form.append("title", title.trim());
  }

  return apiFetch<{ source: SourceSummary }>(
    `/api/notebooks/${notebookId}/sources/upload`,
    {
      token,
      method: "POST",
      body: form,
    },
  );
}

/** @deprecated Prefer uploadSourceFile — kept for call-site clarity. */
export async function uploadTextSource(
  token: string,
  notebookId: string,
  file: File,
  title?: string,
) {
  return uploadSourceFile(token, notebookId, file, title);
}

export async function addUrlSource(
  token: string,
  notebookId: string,
  payload: {
    url: string;
    type?: Extract<SourceType, "WEBSITE" | "YOUTUBE">;
    title?: string;
  },
) {
  return apiFetch<{ source: SourceSummary }>(
    `/api/notebooks/${notebookId}/sources/url`,
    {
      token,
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getSource(token: string, sourceId: string) {
  return apiFetch<{ source: SourceSummary }>(`/api/sources/${sourceId}`, {
    token,
  });
}

export async function reindexSource(token: string, sourceId: string) {
  return apiFetch<{ source: SourceSummary }>(
    `/api/sources/${sourceId}/reindex`,
    {
      token,
      method: "POST",
    },
  );
}

export async function deleteSource(token: string, sourceId: string) {
  return apiFetch<void>(`/api/sources/${sourceId}`, {
    token,
    method: "DELETE",
  });
}
