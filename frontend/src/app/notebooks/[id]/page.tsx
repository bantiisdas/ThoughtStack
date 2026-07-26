"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  SourceViewer,
  type SourceViewerTarget,
} from "@/components/SourceViewer";
import { SourceStatusBadge } from "@/components/SourceStatusBadge";
import {
  formatFileSize,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  MAX_SOURCES_PER_NOTEBOOK,
} from "@/lib/limits";
import { getNotebook, updateNotebook } from "@/lib/notebooks";
import { getLatestConversation, queryNotebook } from "@/lib/query";
import {
  addUrlSource,
  deleteSource,
  reindexSource,
  uploadSourceFile,
} from "@/lib/sources";
import type {
  ChatMessage,
  Citation,
  Notebook,
  SourceStatus,
  SourceType,
} from "@/lib/types";

const IN_FLIGHT: SourceStatus[] = ["UPLOADING", "INDEXING"];
const POLL_MS = 2500;

const FILE_ACCEPT =
  ".txt,.text,.md,.pdf,.vtt,text/plain,text/markdown,text/vtt,application/pdf,text/*";

function looksLikeYoutube(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, "");
    return (
      host === "youtu.be" ||
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    );
  } catch {
    return /youtu\.be\/|youtube\.com\//i.test(url);
  }
}

function formatLocatorHint(citation: Citation): string {
  const { locator, sourceType } = citation;
  if (typeof locator.page === "number") return `p. ${locator.page}`;
  if (typeof locator.startMs === "number") {
    const sec = Math.floor(locator.startMs / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  if (locator.url) return sourceType === "WEBSITE" ? "web" : "link";
  return sourceType.toLowerCase();
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [urlType, setUrlType] = useState<"auto" | "WEBSITE" | "YOUTUBE">(
    "auto",
  );
  const [addingUrl, setAddingUrl] = useState(false);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [viewer, setViewer] = useState<{
    token: string;
    target: SourceViewerTarget;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const openSourceViewer = useCallback(
    async (target: SourceViewerTarget) => {
      try {
        const token = await getToken();
        if (!token) {
          setError("Not authenticated");
          return;
        }
        setViewer({ token, target });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to open source viewer",
        );
      }
    },
    [getToken],
  );

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
          setError(
            err instanceof Error ? err.message : "Failed to load notebook",
          );
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

  // Load latest conversation for chat replay.
  useEffect(() => {
    if (!isLoaded || !notebookId) return;
    let cancelled = false;

    async function loadConversation() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const { conversation } = await getLatestConversation(token, notebookId);
        if (cancelled) return;
        if (conversation) {
          setConversationId(conversation.id);
          setMessages(conversation.messages);
        } else {
          setConversationId(null);
          setMessages([]);
        }
      } catch {
        // Non-fatal — chat can start empty.
        if (!cancelled) {
          setConversationId(null);
          setMessages([]);
        }
      }
    }

    void loadConversation();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, notebookId, getToken]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

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

  function upsertSource(source: NonNullable<Notebook["sources"]>[number]) {
    setNotebook((prev) => {
      if (!prev) return prev;
      const existing = prev.sources ?? [];
      return {
        ...prev,
        sources: [source, ...existing.filter((s) => s.id !== source.id)],
      };
    });
  }

  function removeSourceLocal(sourceId: string) {
    setNotebook((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sources: (prev.sources ?? []).filter((s) => s.id !== sourceId),
      };
    });
  }

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
        prev
          ? { ...prev, title: updated.title, updatedAt: updated.updatedAt }
          : updated,
      );
      setEditingTitle(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to rename notebook",
      );
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleFileUpload(file: File | null) {
    if (!file || !notebook || uploading) return;

    if (sources.length >= MAX_SOURCES_PER_NOTEBOOK) {
      setError(
        `This notebook already has ${MAX_SOURCES_PER_NOTEBOOK} sources (maximum). Delete one to add another.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError(
        `“${file.name}” is ${formatFileSize(file.size)}. Maximum upload size is ${MAX_FILE_MB} MB.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const { source } = await uploadSourceFile(token, notebook.id, file);
      upsertSource(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleAddUrl(e: FormEvent) {
    e.preventDefault();
    if (!notebook || addingUrl) return;
    const url = urlValue.trim();
    if (!url) return;

    if (sources.length >= MAX_SOURCES_PER_NOTEBOOK) {
      setError(
        `This notebook already has ${MAX_SOURCES_PER_NOTEBOOK} sources (maximum). Delete one to add another.`,
      );
      return;
    }

    setAddingUrl(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      let type: Extract<SourceType, "WEBSITE" | "YOUTUBE"> | undefined;
      if (urlType === "auto") {
        type = looksLikeYoutube(url) ? "YOUTUBE" : "WEBSITE";
      } else {
        type = urlType;
      }

      const { source } = await addUrlSource(token, notebook.id, {
        url,
        type,
        title: urlTitle.trim() || undefined,
      });
      upsertSource(source);
      setUrlOpen(false);
      setUrlValue("");
      setUrlTitle("");
      setUrlType("auto");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add URL source");
    } finally {
      setAddingUrl(false);
    }
  }

  async function handleReindex(sourceId: string) {
    if (busySourceId) return;
    setBusySourceId(sourceId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const { source } = await reindexSource(token, sourceId);
      upsertSource(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reindex source");
    } finally {
      setBusySourceId(null);
    }
  }

  async function confirmDeleteSource() {
    if (!pendingDeleteSource || busySourceId) return;
    const { id: sourceId } = pendingDeleteSource;

    setBusySourceId(sourceId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      await deleteSource(token, sourceId);
      removeSourceLocal(sourceId);
      setPendingDeleteSource(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete source");
    } finally {
      setBusySourceId(null);
    }
  }

  const readyCount = sources.filter((s) => s.status === "READY").length;

  async function handleAsk(e: FormEvent) {
    e.preventDefault();
    if (!notebook || asking || readyCount === 0) return;
    const q = question.trim();
    if (!q) return;

    setAsking(true);
    setError(null);
    setQuestion("");

    const tempUserId = `temp-user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: "user",
        content: q,
        citations: null,
        meta: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const result = await queryNotebook(token, notebook.id, {
        question: q,
        conversationId,
      });

      setConversationId(result.conversationId);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempUserId);
        return [
          ...withoutTemp,
          {
            id: result.userMessageId,
            role: "user",
            content: q,
            citations: null,
            meta: null,
            createdAt: new Date().toISOString(),
          },
          {
            id: result.assistantMessageId,
            role: "assistant",
            content: result.answer,
            citations: result.citations,
            meta: result.meta,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserId));
      setQuestion(q);
      setError(err instanceof Error ? err.message : "Failed to get an answer");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppHeader subtitle="Workspace" />

      <div className="flex shrink-0 items-center gap-3 border-b border-[#e7e5e4] px-4 py-3 sm:px-6">
        <Link
          href="/notebooks"
          className="text-sm text-[#78716c] transition hover:text-[#1c1917]"
        >
          ← Notebooks
        </Link>
        <span className="text-[#d6d3d1]">/</span>
        {loading ? (
          <span
            className="inline-block h-4 w-40 animate-pulse rounded bg-[#e7e5e4]"
            aria-label="Loading notebook"
          />
        ) : notebook ? (
          editingTitle ? (
            <form
              onSubmit={handleRename}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
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
        <ErrorBanner
          className="mx-4 mt-4 shrink-0 sm:mx-6"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {!loading && !notebook && !error ? (
        <p className="mx-auto mt-16 text-sm text-[#78716c]">
          Notebook not found.
        </p>
      ) : null}

      {notebook ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Sources panel */}
          <aside className="flex max-h-[40vh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-[#e7e5e4] lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-semibold tracking-wide text-[#44403c] uppercase">
                Sources
              </h2>
              <span className="text-xs text-[#a8a29e]">
                {sources.length}/{MAX_SOURCES_PER_NOTEBOOK}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 px-4 pb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  void handleFileUpload(e.target.files?.[0] ?? null);
                }}
              />
              <button
                type="button"
                disabled={
                  uploading || sources.length >= MAX_SOURCES_PER_NOTEBOOK
                }
                onClick={() => fileInputRef.current?.click()}
                title={`PDF, text, or VTT · max ${MAX_FILE_MB} MB`}
                className="rounded-md border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-xs text-[#1c1917] transition hover:border-[#a8a29e] hover:bg-[#fafaf9] disabled:cursor-not-allowed disabled:text-[#a8a29e]"
              >
                {uploading ? "Uploading…" : "Upload file"}
              </button>
              <button
                type="button"
                disabled={
                  addingUrl || sources.length >= MAX_SOURCES_PER_NOTEBOOK
                }
                onClick={() => setUrlOpen((v) => !v)}
                className="rounded-md border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-xs text-[#1c1917] transition hover:border-[#a8a29e] hover:bg-[#fafaf9] disabled:cursor-not-allowed disabled:text-[#a8a29e]"
              >
                {urlOpen ? "Cancel URL" : "Add URL"}
              </button>
            </div>
            <p className="px-4 pb-2 text-[11px] text-[#a8a29e]">
              Files up to {MAX_FILE_MB} MB · PDF, .txt/.md, .vtt
            </p>

            {urlOpen ? (
              <form
                onSubmit={handleAddUrl}
                className="mx-4 mb-3 space-y-2 rounded-md border border-[#e7e5e4] bg-[#fafaf9] p-3"
              >
                <label className="block text-xs text-[#57534e]">
                  Website or YouTube URL
                  <input
                    type="url"
                    required
                    value={urlValue}
                    onChange={(e) => setUrlValue(e.target.value)}
                    placeholder="https://…"
                    className="mt-1 w-full rounded-md border border-[#d6d3d1] bg-white px-2 py-1.5 text-sm outline-none ring-[#2f4f3a] focus:ring-2"
                  />
                </label>
                <label className="block text-xs text-[#57534e]">
                  Title (optional)
                  <input
                    type="text"
                    value={urlTitle}
                    onChange={(e) => setUrlTitle(e.target.value)}
                    maxLength={200}
                    className="mt-1 w-full rounded-md border border-[#d6d3d1] bg-white px-2 py-1.5 text-sm outline-none ring-[#2f4f3a] focus:ring-2"
                  />
                </label>
                <label className="block text-xs text-[#57534e]">
                  Type
                  <select
                    value={urlType}
                    onChange={(e) =>
                      setUrlType(
                        e.target.value as "auto" | "WEBSITE" | "YOUTUBE",
                      )
                    }
                    className="mt-1 w-full rounded-md border border-[#d6d3d1] bg-white px-2 py-1.5 text-sm outline-none ring-[#2f4f3a] focus:ring-2"
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="WEBSITE">Website</option>
                    <option value="YOUTUBE">YouTube</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={addingUrl || !urlValue.trim()}
                  className="w-full rounded-md bg-[#2f4f3a] px-2.5 py-1.5 text-xs font-medium text-[#f4f7f4] disabled:opacity-50"
                >
                  {addingUrl ? "Adding…" : "Add source"}
                </button>
              </form>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {sources.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#d6d3d1] px-3 py-8 text-center text-xs leading-relaxed text-[#78716c]">
                  No sources yet.
                  <br />
                  Upload a text, PDF, or VTT file — or add a website / YouTube
                  URL.
                </div>
              ) : (
                <ul className="space-y-2">
                  {sources.map((source) => {
                    const busy = busySourceId === source.id;
                    const canRetry =
                      source.status === "FAILED" || source.status === "READY";
                    const inFlight = IN_FLIGHT.includes(source.status);

                    return (
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
                          {source.originalName
                            ? ` · ${source.originalName}`
                            : source.url
                              ? ` · ${source.url}`
                              : ""}
                        </p>
                        {source.status === "FAILED" && source.errorMessage ? (
                          <p className="mt-1 text-xs leading-snug text-red-700">
                            {source.errorMessage}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {source.status === "READY" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void openSourceViewer({
                                  sourceId: source.id,
                                  sourceType: source.type,
                                  sourceTitle: source.title,
                                  url: source.url,
                                })
                              }
                              className="text-xs font-medium text-[#2f4f3a] hover:underline"
                            >
                              View
                            </button>
                          ) : null}
                          {canRetry ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleReindex(source.id)}
                              className="text-xs font-medium text-[#2f4f3a] hover:underline disabled:text-[#a8a29e]"
                            >
                              {busy
                                ? "Working…"
                                : source.status === "FAILED"
                                  ? "Retry"
                                  : "Reindex"}
                            </button>
                          ) : null}
                          {!inFlight ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setPendingDeleteSource({
                                  id: source.id,
                                  title: source.title,
                                })
                              }
                              className="text-xs font-medium text-red-700 hover:underline disabled:text-[#a8a29e]"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Chat panel */}
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-[#e7e5e4] px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold tracking-wide text-[#44403c] uppercase">
                Chat
              </h2>
              <p className="mt-1 text-xs text-[#78716c]">
                Ask questions once at least one source is ready.
                {readyCount > 0 ? ` ${readyCount} ready.` : " None ready yet."}
              </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
              {messages.length === 0 && !asking ? (
                <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                  <p className="max-w-sm text-sm text-[#78716c]">
                    {readyCount === 0
                      ? "Index at least one source, then ask a question grounded in your materials."
                      : "Ask anything about your sources. Click a citation chip to open the source at that locus."}
                  </p>
                </div>
              ) : (
                <ul className="flex w-full flex-col gap-4">
                  {messages.map((message) => {
                    const isUser = message.role === "user";
                    const citations = message.citations ?? [];

                    return (
                      <li
                        key={message.id}
                        className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-md px-3 py-2 text-sm leading-relaxed sm:max-w-[75%] ${
                            isUser
                              ? "whitespace-pre-wrap bg-[#2f4f3a] text-[#f4f7f4]"
                              : "w-full max-w-none border border-[#e7e5e4] bg-white text-[#1c1917]"
                          }`}
                        >
                          {isUser ? (
                            message.content
                          ) : (
                            <MarkdownContent content={message.content} />
                          )}
                        </div>
                        {!isUser && citations.length > 0 ? (
                          <div className="mt-2 flex w-full flex-wrap gap-1.5">
                            {citations.map((citation) => (
                              <button
                                key={`${message.id}-${citation.citationId}-${citation.chunkId}`}
                                type="button"
                                title={citation.snippet}
                                onClick={() =>
                                  void openSourceViewer({
                                    sourceId: citation.sourceId,
                                    sourceType: citation.sourceType,
                                    sourceTitle: citation.sourceTitle,
                                    citation,
                                    url: citation.locator.url,
                                  })
                                }
                                className="rounded border border-[#d6d3d1] bg-[#fafaf9] px-2 py-0.5 text-left text-[11px] text-[#44403c] transition hover:border-[#2f4f3a] hover:bg-[#eef3ef]"
                              >
                                [{citation.citationId}] {citation.sourceTitle}
                                <span className="text-[#a8a29e]">
                                  {" "}
                                  · {formatLocatorHint(citation)}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {!isUser && message.meta ? (
                          <p className="mt-1 text-[10px] text-[#a8a29e]">
                            Grade {message.meta.grade}/10 · attempt{" "}
                            {message.meta.attempts}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                  {asking ? (
                    <li
                      className="flex items-center gap-2 text-sm text-[#78716c]"
                      aria-live="polite"
                    >
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#2f4f3a]" />
                      Thinking… retrieving and grading answer
                    </li>
                  ) : null}
                  <div ref={chatEndRef} />
                </ul>
              )}
            </div>

            <form
              className="shrink-0 border-t border-[#e7e5e4] px-4 py-4 sm:px-6"
              onSubmit={(e) => {
                void handleAsk(e);
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
                  disabled={readyCount === 0 || asking}
                  className="min-w-0 flex-1 rounded-md border border-[#d6d3d1] bg-white px-3 py-2.5 text-sm outline-none ring-[#2f4f3a] placeholder:text-[#a8a29e] focus:ring-2 disabled:bg-[#f5f5f4] disabled:text-[#a8a29e]"
                />
                <button
                  type="submit"
                  disabled={readyCount === 0 || !question.trim() || asking}
                  className="rounded-md bg-[#2f4f3a] px-4 py-2.5 text-sm font-medium text-[#f4f7f4] transition hover:bg-[#243d2d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {asking ? "…" : "Ask"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {viewer ? (
        <SourceViewer
          token={viewer.token}
          target={viewer.target}
          onClose={() => setViewer(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDeleteSource !== null}
        title="Delete source?"
        description={
          pendingDeleteSource
            ? `Delete “${pendingDeleteSource.title}”? Chunks and embeddings for this source will be removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        danger
        busy={busySourceId === pendingDeleteSource?.id}
        onCancel={() => {
          if (busySourceId) return;
          setPendingDeleteSource(null);
        }}
        onConfirm={() => {
          void confirmDeleteSource();
        }}
      />
    </main>
  );
}
