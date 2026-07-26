import { apiFetch } from "./api";
import type { SourceSummary } from "./types";

export async function uploadTextSource(
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

export async function getSource(token: string, sourceId: string) {
  return apiFetch<{ source: SourceSummary }>(`/api/sources/${sourceId}`, {
    token,
  });
}
