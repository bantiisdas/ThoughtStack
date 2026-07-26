"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

type AppHeaderProps = {
  subtitle?: string;
};

export function AppHeader({ subtitle }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-[#e7e5e4] bg-[#f7f4ef]/90 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-6">
        <Link
          href="/notebooks"
          className="text-lg font-semibold tracking-tight text-[#1c1917]"
        >
          ThoughtStack
        </Link>
        {subtitle ? (
          <span className="text-sm text-[#78716c]">{subtitle}</span>
        ) : null}
      </div>
      <UserButton />
    </header>
  );
}
