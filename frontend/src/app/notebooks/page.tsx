"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function NotebooksPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            ThoughtStack
          </Link>
          <span className="text-sm text-zinc-500">Notebooks</span>
        </div>
        <UserButton />
      </header>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Your notebooks</h1>
        <p className="mt-3 max-w-xl text-zinc-600">
          Authenticated shell is ready. Notebook CRUD lands in Phase 1.
        </p>
        <div className="mt-10 rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500">
          No notebooks yet — create flow coming next.
        </div>
      </section>
    </main>
  );
}
