"use client";

import Link from "next/link";
import { UserButton } from "./UserButton";
import { LogoMark } from "./Decor";

// Minimal header for pages outside the logged-in app shell (onboarding,
// checkout, choose-plan, upgrade). No nav links by design.
export function PageHeader({ showUser = true }: { showUser?: boolean }) {
  return (
    <nav className="px-6 py-4 flex items-center justify-between border-b border-brand-900/10 bg-white/85 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2.5">
        <LogoMark />
        <span className="font-extrabold text-lg tracking-tight text-brand-900">Campus Macros</span>
      </Link>
      {showUser && <UserButton />}
    </nav>
  );
}

export function PageFooter() {
  return (
    <footer className="px-6 py-6 border-t border-brand-900/10 bg-white/60">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <LogoMark className="w-5 h-5" />
          © {new Date().getFullYear()} Campus Macros
        </span>
        <span className="hidden sm:inline text-gray-300">·</span>
        <span>Eat well, hit your macros, stay on budget 🥗</span>
      </div>
    </footer>
  );
}
