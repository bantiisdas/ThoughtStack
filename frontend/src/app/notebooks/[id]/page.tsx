"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SourceStatusBadge } from "@/components/SourceStatusBadge";
import { getNotebook, updateNotebook } from "@/lib/notebooks";
import { uploadTextSource } from "@/lib/sources";
import type { Notebook, SourceStatus } from "@/lib/types";

const IN_FLIGHT: SourceStatus[] = ["UPLOADING", "INDEXING"];
const POLL_MS = 2500;

export default function NotebookWorkspacePage() {
  const params = useParams<{ id: string }>();
  const notebookId = params.id;
  const { getToken, isLoaded } = useAuth();

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) {
        setError(null);
      }
      try {
        const token = await getToken();
        if (!token) {
          setError("Not authenticated");
          return;
        }
        const data = await getNotebook(token, notebookId);
        setNotebook(data.notebook);
        setTitleDraft(data.notebook.title);
      } catch (err) {
        if (!opts?.quiet) {
          setError(err instanceof Error ? err.message : "Failed to load notebook");
          setNotebook(null);
        }
      } finally {
        if (!opts?.quiet) {
          setLoading(false);
        }
      }
    },
    [getToken, notebookId],
  );

  useEffect(() => {
    if (!isLoaded || !notebookId) return;
    void load();
  }, [isLoaded, notebookId, load]);

  const sources = notebook?.sources ?? [];
  const hasInFlight = sources.some((s) => IN_FLIGHT.includes(s.status));

  // Poll while any source is still uploading/indexing.
  useEffect(() => {
    if (!hasInFlight || !isLoaded) return;
    const id = window.setInterval(() => {
      void load({ quiet: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [hasInFlight, isLoaded, load]);

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!notebook || savingTitle) return;
    const next = titleDraft.trim();
    if (!next || next === notebook.title) {
      setEditingTitle(false);
      setTitleDraft(notebook.title);
      return;
    }

    setSavingTitle(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const { notebook: updated } = await updateNotebook(token, notebook.id, {
        title: next,
      });
      setNotebook((prev) =>
        prev ? { ...prev, title: updated.title, updatedAt: updated.updatedAt } : updated,
      );
      setEditingTitle(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename notebook");
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleTextUpload(file: File | null) {
    if (!file || !notebook || uploading) return;

    setUploading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const { source } = await uploadTextSource(token, notebook.id, file);
      setNotebook((prev) => {
        if (!prev) return prev;
        const existing = prev.sources ?? [];
        return {
          ...prev,
          sources: [source, ...existing.filter((s) => s.id !== source.id)],
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload text file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const readyCount = sources.filter((s) => s.status === "READY").length;

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader subtitle="Workspace" />

      <div className="flex items-center gap-3 border-b border-[#e7e5e4] px-4 py-3 sm:px-6">
        <Link
          href="/notebooks"
          className="text-sm text-[#78716c] transition hover:text-[#1c1917]"
        >
          ← Notebooks
        </Link>
        <span className="text-[#d6d3d1]">/</span>
        {loading ? (
          <span className="text-sm text-[#a8a29e]">Loading…</span>
        ) : notebook ? (
          editingTitle ? (
            <form onSubmit={handleRename} className="flex min-w-0 flex-1 items-center gap-2">
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={200}
                className="min-w-0 flex-1 rounded-md border border-[#d6d3d1] bg-white px-2 py-1 text-sm outline-none ring-[#2f4f3a] focus:ring-2"
              />
              <button
                type="submit"
                disabled={savingTitle}
                className="rounded-md bg-[#2f4f3a] px-2.5 py-1 text-xs font-medium text-[#f4f7f4] disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingTitle(false);
                  setTitleDraft(notebook.title);
                }}
                className="rounded-md px-2.5 py-1 text-xs text-[#57534e] hover:bg-black/5"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="truncate text-left text-sm font-medium text-[#1c1917] hover:underline"
              title="Rename notebook"
            >
              {notebook.title}
            </button>
          )
        ) : (
          <span className="text-sm text-[#a8a29e]">Notebook</span>
        )}
      </div>

      {error ? (
        <p className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-6">
          {error}
        </p>
      ) : null}

      {!loading && !notebook && !error ? (
        <p className="mx-auto mt-16 text-sm text-[#78716c]">Notebook not found.</p>
      ) : null}

      {notebook ? (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Sources panel */}
          <aside className="flex w-full flex-col border-b border-[#e7e5e4] lg:w-80 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-semibold tracking-wide text-[#44403c] uppercase">
                Sources
              </h2>
              <span className="text-xs text-[#a8a29e]">
                {sources.length} total
              </span>
            </div>

            <div className="flex flex-wrap gap-2 px-4 pb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.text,.md,text/plain,text/markdown,text/*"
                className="hidden"
                onChange={(e) => {
                  void handleTextUpload(e.target.files?.[0] ?? null);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-xs text-[#1c1917] transition hover:border-[#a8a29e] hover:bg-[#fafaf9] disabled:cursor-not-allowed disabled:text-[#a8a29e]"
              >
                {uploading ? "Uploading…" : "Upload text"}
              </button>
              <button
                type="button"
                disabled
                title="Coming in a later phase"
                className="rounded-md border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-xs text-[#a8a29e]"
              >
                Add URL
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              {sources.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#d6d3d1] px-3 py-8 text-center text-xs leading-relaxed text-[#78716c]">
                  No sources yet.
                  <br />
                  Upload a .txt file to start indexing.
                </div>
              ) : (
                <ul className="space-y-2">
                  {sources.map((source) => (
                    <li
                      key={source.id}
                      className="rounded-md border border-[#e7e5e4] bg-white/60 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-[#1c1917]">
                          {source.title}
                        </p>
                        <SourceStatusBadge status={source.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-[#78716c]">
                        {source.type}
                        {source.originalName ? ` · ${source.originalName}` : ""}
                      </p>
                      {source.status === "FAILED" && source.errorMessage ? (
                        <p className="mt-1 text-xs leading-snug text-red-700">
                          {source.errorMessage}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {/* Chat panel */}
          <section className="flex min-h-[50vh] flex-1 flex-col">
            <div className="border-b border-[#e7e5e4] px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold tracking-wide text-[#44403c] uppercase">
                Chat
              </h2>
              <p className="mt-1 text-xs text-[#78716c]">
                Ask questions once at least one source is ready.
                {readyCount > 0
                  ? ` ${readyCount} ready.`
                  : " None ready yet."}
              </p>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <p className="max-w-sm text-sm text-[#78716c]">
                Answers with citations will appear here. Query pipeline arrives
                in Phase 4.
              </p>
            </div>

            <form
              className="border-t border-[#e7e5e4] px-4 py-4 sm:px-6"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={
                    readyCount === 0
                      ? "Add a ready source before asking…"
                      : "Ask a question about your sources…"
                  }
                  disabled={readyCount === 0}
                  className="min-w-0 flex-1 rounded-md border border-[#d6d3d1] bg-white px-3 py-2.5 text-sm outline-none ring-[#2f4f3a] placeholder:text-[#a8a29e] focus:ring-2 disabled:bg-[#f5f5f4] disabled:text-[#a8a29e]"
                />
                <button
                  type="submit"
                  disabled={readyCount === 0 || !question.trim()}
                  className="rounded-md bg-[#2f4f3a] px-4 py-2.5 text-sm font-medium text-[#f4f7f4] transition hover:bg-[#243d2d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ask
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
