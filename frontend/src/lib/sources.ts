import { ApiError, apiFetch, getApiUrl } from "./api";
import type { SourceContentResponse, SourceSummary, SourceType } from "./types";

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

export async function getSourceContent(token: string, sourceId: string) {
  return apiFetch<SourceContentResponse>(`/api/sources/${sourceId}/content`, {
    token,
  });
}

/** Fetch stored binary (PDF etc.) as a Blob for in-browser viewers. */
export async function getSourceFileBlob(
  token: string,
  sourceId: string,
): Promise<Blob> {
  const res = await fetch(getApiUrl(`/api/sources/${sourceId}/file`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = body || `Request failed: ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep raw body
    }
    throw new ApiError(res.status, message);
  }

  return res.blob();
}
