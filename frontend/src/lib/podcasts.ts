import { ApiError, apiFetch, getApiUrl } from "./api";
import type { PodcastSummary } from "./types";

export async function listPodcasts(token: string, notebookId: string) {
  return apiFetch<{ podcasts: PodcastSummary[] }>(
    `/api/notebooks/${notebookId}/podcasts`,
    { token },
  );
}

export async function createPodcast(token: string, notebookId: string) {
  return apiFetch<{ podcast: PodcastSummary }>(
    `/api/notebooks/${notebookId}/podcasts`,
    {
      token,
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function getPodcast(token: string, podcastId: string) {
  return apiFetch<{ podcast: PodcastSummary }>(`/api/podcasts/${podcastId}`, {
    token,
  });
}

export async function deletePodcast(token: string, podcastId: string) {
  return apiFetch<void>(`/api/podcasts/${podcastId}`, {
    token,
    method: "DELETE",
  });
}

/** Fetch generated MP3 as a Blob for in-browser playback / download. */
export async function getPodcastAudioBlob(
  token: string,
  podcastId: string,
): Promise<Blob> {
  const res = await fetch(getApiUrl(`/api/podcasts/${podcastId}/audio`), {
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
