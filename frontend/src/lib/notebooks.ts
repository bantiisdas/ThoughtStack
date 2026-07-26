import { apiFetch } from "./api";
import type { Notebook } from "./types";

export async function listNotebooks(token: string) {
  return apiFetch<{ notebooks: Notebook[] }>("/api/notebooks", { token });
}

export async function getNotebook(token: string, id: string) {
  return apiFetch<{ notebook: Notebook }>(`/api/notebooks/${id}`, { token });
}

export async function createNotebook(
  token: string,
  data: { title: string; description?: string },
) {
  return apiFetch<{ notebook: Notebook }>("/api/notebooks", {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateNotebook(
  token: string,
  id: string,
  data: { title?: string; description?: string | null },
) {
  return apiFetch<{ notebook: Notebook }>(`/api/notebooks/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteNotebook(token: string, id: string) {
  return apiFetch<void>(`/api/notebooks/${id}`, {
    token,
    method: "DELETE",
  });
}
