import { Show } from "@clerk/nextjs";
import Link from "next/link";
import {
  HeaderAuth,
  HeaderAuthed,
  HeroCtasSignedOut,
} from "@/components/AuthControls";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f4ef] text-[#1c1917]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#e7efe8_0%,_transparent_55%),linear-gradient(180deg,_#f7f4ef_0%,_#ebe6dc_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(28,25,23,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(28,25,23,0.04)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <p className="text-sm font-medium tracking-[0.18em] text-[#3f5d4a] uppercase">
          ThoughtStack
        </p>
        <Show when="signed-out">
          <HeaderAuth />
        </Show>
        <Show when="signed-in">
          <HeaderAuthed />
        </Show>
      </header>

      <section className="relative z-10 mx-auto flex max-w-3xl flex-col px-6 pb-24 pt-16 md:px-10 md:pt-24">
        <h1 className="font-sans text-5xl font-semibold tracking-tight text-[#1c1917] md:text-6xl">
          ThoughtStack
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#57534e]">
          Turn PDFs, notes, websites, and videos into an isolated notebook you
          can ask — with citations that jump back to the source.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Show when="signed-out">
            <HeroCtasSignedOut />
          </Show>
          <Show when="signed-in">
            <Link
              href="/notebooks"
              className="rounded-md bg-[#2f4f3a] px-5 py-3 text-sm font-medium text-[#f4f7f4] transition hover:bg-[#243d2d]"
            >
              Go to notebooks
            </Link>
          </Show>
        </div>
        <p className="mt-8 text-xs text-[#78716c]">
          API: {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}
        </p>
      </section>
    </main>
  );
}
