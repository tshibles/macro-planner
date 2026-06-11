"use client";

import Link from "next/link";
import { UserButton } from "./UserButton";

// Minimal header for pages outside the logged-in app shell (onboarding,
// checkout, choose-plan, upgrade). No nav links by design.
export function PageHeader({ showUser = true }: { showUser?: boolean }) {
  return (
    <nav className="px-6 py-4 flex items-center justify-between border-b border-white/5">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-brand-500 text-xl">⚡</span>
        <span className="font-bold text-lg tracking-tight">Campus Macros</span>
      </Link>
      {showUser && <UserButton />}
    </nav>
  );
}

export function PageFooter() {
  return (
    <footer className="px-6 py-4 text-center text-xs text-gray-600 border-t border-white/5">
      © {new Date().getFullYear()} Campus Macros · Built for college students
    </footer>
  );
}
