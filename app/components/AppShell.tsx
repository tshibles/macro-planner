"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { getTierById } from "@/app/data/plans";

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
      <nav className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 border-b border-white/5 sticky top-0 bg-gray-950/90 backdrop-blur-md z-20">
        {/* Logo */}
        <Link href="/plan" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-brand-500 text-xl">⚡</span>
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
                className={`text-sm font-medium px-3 sm:px-4 py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-brand-500/15 text-brand-400"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
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
            <span className="hidden md:block text-xs text-gray-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              {tierInfo.label} · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
            </span>
          )}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account menu"
              className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-30">
                <div className="px-4 py-3 border-b border-white/8">
                  <p className="text-xs text-gray-500">Signed in as</p>
                  <p className="text-sm text-white truncate">{email ?? "…"}</p>
                  {tierInfo && daysLeft != null && (
                    <p className="md:hidden text-xs text-gray-500 mt-1">
                      {tierInfo.label} · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col">{children}</div>

      <footer className="px-6 py-4 text-center text-xs text-gray-600 border-t border-white/5">
        © {new Date().getFullYear()} Campus Macros · Built for college students
      </footer>
    </div>
  );
}
