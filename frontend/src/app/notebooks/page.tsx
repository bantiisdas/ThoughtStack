"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  createNotebook,
  deleteNotebook,
  listNotebooks,
} from "@/lib/notebooks";
import type { Notebook } from "@/lib/types";

export default function NotebooksPage() {
  const { getToken, isLoaded } = useAuth();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Not authenticated");
        return;
      }
      const data = await listNotebooks(token);
      setNotebooks(data.notebooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notebooks");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded, load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const { notebook } = await createNotebook(token, {
        title: trimmed,
        description: description.trim() || undefined,
      });
      setNotebooks((prev) => [notebook, ...prev]);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create notebook");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, notebookTitle: string) {
    if (
      !window.confirm(
        `Delete “${notebookTitle}”? Sources and chat history for this notebook will be removed.`,
      )
    ) {
      return;
    }

    setDeletingId(id);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      await deleteNotebook(token, id);
      setNotebooks((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete notebook");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle="Notebooks" />

      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Your notebooks
            </h1>
            <p className="mt-2 max-w-xl text-[#57534e]">
              Each notebook keeps its own sources and knowledge base.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreate}
          className="mt-10 space-y-3 border-t border-[#e7e5e4] pt-8"
        >
          <label className="block text-sm font-medium text-[#44403c]">
            New notebook
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Research notes"
              maxLength={200}
              className="mt-2 w-full rounded-md border border-[#d6d3d1] bg-white px-3 py-2 text-sm text-[#1c1917] outline-none ring-[#2f4f3a] placeholder:text-[#a8a29e] focus:ring-2"
              required
            />
          </label>
          <label className="block text-sm font-medium text-[#44403c]">
            Description{" "}
            <span className="font-normal text-[#a8a29e]">(optional)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this notebook for?"
              maxLength={2000}
              className="mt-2 w-full rounded-md border border-[#d6d3d1] bg-white px-3 py-2 text-sm text-[#1c1917] outline-none ring-[#2f4f3a] placeholder:text-[#a8a29e] focus:ring-2"
            />
          </label>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="rounded-md bg-[#2f4f3a] px-4 py-2 text-sm font-medium text-[#f4f7f4] transition hover:bg-[#243d2d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create notebook"}
          </button>
        </form>

        {error ? (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-10">
          {loading ? (
            <p className="text-sm text-[#78716c]">Loading notebooks…</p>
          ) : notebooks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d6d3d1] px-6 py-12 text-center text-sm text-[#78716c]">
              No notebooks yet — create one above to open a workspace.
            </div>
          ) : (
            <ul className="divide-y divide-[#e7e5e4] border-t border-[#e7e5e4]">
              {notebooks.map((notebook) => (
                <li
                  key={notebook.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/notebooks/${notebook.id}`}
                      className="text-base font-medium text-[#1c1917] underline-offset-4 hover:underline"
                    >
                      {notebook.title}
                    </Link>
                    {notebook.description ? (
                      <p className="mt-1 truncate text-sm text-[#78716c]">
                        {notebook.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-[#a8a29e]">
                      {notebook._count?.sources ?? 0} source
                      {(notebook._count?.sources ?? 0) === 1 ? "" : "s"}
                      {" · "}
                      Updated{" "}
                      {new Date(notebook.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/notebooks/${notebook.id}`}
                      className="rounded-md border border-[#d6d3d1] bg-white px-3 py-1.5 text-sm text-[#292524] transition hover:bg-[#fafaf9]"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(notebook.id, notebook.title)}
                      disabled={deletingId === notebook.id}
                      className="rounded-md px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === notebook.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
