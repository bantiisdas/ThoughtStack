"use client";

import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function HeaderAuth() {
  return (
    <div className="flex items-center gap-3">
      <SignInButton mode="modal">
        <button className="rounded-md px-3 py-2 text-sm text-[#44403c] transition hover:bg-black/5">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="rounded-md bg-[#1c1917] px-3 py-2 text-sm text-[#fafaf9] transition hover:bg-[#292524]">
          Get started
        </button>
      </SignUpButton>
    </div>
  );
}

export function HeaderAuthed() {
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/notebooks"
        className="rounded-md px-3 py-2 text-sm text-[#44403c] transition hover:bg-black/5"
      >
        Open notebooks
      </Link>
      <UserButton />
    </div>
  );
}

export function HeroCtasSignedOut() {
  return (
    <>
      <SignUpButton mode="modal">
        <button className="rounded-md bg-[#2f4f3a] px-5 py-3 text-sm font-medium text-[#f4f7f4] transition hover:bg-[#243d2d]">
          Create an account
        </button>
      </SignUpButton>
      <SignInButton mode="modal">
        <button className="rounded-md border border-[#d6d3d1] bg-white/70 px-5 py-3 text-sm font-medium text-[#292524] backdrop-blur transition hover:bg-white">
          Sign in
        </button>
      </SignInButton>
    </>
  );
}
