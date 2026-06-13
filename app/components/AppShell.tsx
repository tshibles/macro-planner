"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { getTierById } from "@/app/data/plans";
import { LogoMark } from "./Decor";
import { SupportChat } from "./SupportChat";

const NAV_LINKS = [
  { href: "/plan", label: "Plan" },
  { href: "/grocery", label: "Grocery" },
  { href: "/settings", label: "Settings" },
];

interface SubInfo {
  tier: string;
  expiresAt: string;
}

// Shell for all logged-in app pages (/plan, /grocery, /settings): persistent
// top nav with subscription status, plus the subscription gate — anyone
// without an active subscriptions row (paid or 7-day trial) is redirected out.
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Subscription gate. When returning from Stripe (?paid=true) poll for up to
  // 12 s to give the webhook time to land before deciding access is gone.
  useEffect(() => {
    let active = true;
    let attempt = 0;
    const paid =
      new URLSearchParams(window.location.search).get("paid") === "true";
    const maxAttempts = paid ? 8 : 1;

    async function check() {
      try {
        const data = await fetch("/api/subscriptions/status").then((r) => r.json());
        if (!active) return;
        if (data.unlocked) {
          setSub({ tier: data.tier ?? "monthly", expiresAt: data.expiresAt });
          return;
        }
      } catch {}
      attempt++;
      if (active && attempt < maxAttempts) {
        setTimeout(check, 1500);
        return;
      }
      if (!active) return;
      // No active access: expired users hit the paywall; brand-new users who
      // never used their trial go choose a plan instead.
      const trial = await fetch("/api/free-trial/status")
        .then((r) => r.json())
        .catch(() => ({ used: true }));
      if (!active) return;
      router.replace(trial.used === false ? "/choose-plan" : "/upgrade");
    }

    check();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // Close the account menu on outside click.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const tierInfo = sub ? getTierById(sub.tier) : null;
  const daysLeft = sub
    ? Math.max(
        0,
        Math.ceil((new Date(sub.expiresAt).getTime() - Date.now()) / 86_400_000)
      )
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 border-b border-brand-900/10 sticky top-0 bg-white/85 backdrop-blur-md z-20">
        {/* Logo */}
        <Link href="/plan" className="flex items-center gap-2.5 flex-shrink-0">
          <LogoMark />
          <span className="font-bold text-lg tracking-tight hidden sm:block">
            Campus Macros
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium px-3 sm:px-4 py-1.5 rounded-full transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-brand-500/25 to-emerald-500/20 text-brand-700 border border-brand-300 shadow-sm shadow-brand-500/10"
                    : "text-gray-600 hover:text-brand-800 hover:bg-brand-50 border border-transparent"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Subscription status + account menu */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {tierInfo && daysLeft != null && (
            <span className="hidden md:block text-xs text-gray-600 bg-white border border-gray-200 rounded-full px-3 py-1">
              {tierInfo.label} · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
            </span>
          )}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account menu"
              className="w-8 h-8 rounded-full bg-gray-50 hover:bg-brand-100 border border-gray-200 flex items-center justify-center transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-700">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-2xl shadow-brand-900/15 overflow-hidden z-30">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-xs text-gray-500">Signed in as</p>
                  <p className="text-sm text-gray-900 truncate">{email ?? "…"}</p>
                  {tierInfo && daysLeft != null && (
                    <p className="md:hidden text-xs text-gray-500 mt-1">
                      {tierInfo.label} · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-gray-900 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col">{children}</div>

      {/* AI support chat — logged-in app pages only */}
      <SupportChat />

      <footer className="px-6 py-5 border-t border-brand-900/10">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <LogoMark className="w-5 h-5" />
          © {new Date().getFullYear()} Campus Macros · Built for college students
          <span className="text-gray-300">·</span>
          <Link href="/privacy" className="hover:text-brand-700 underline-offset-2 hover:underline">Privacy</Link>
          <Link href="/terms" className="hover:text-brand-700 underline-offset-2 hover:underline">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
