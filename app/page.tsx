"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";
import { resolvePostAuthDestination } from "@/app/lib/postAuth";
import { planTiers } from "@/app/data/plans";
import { PageFooter } from "@/app/components/PageHeader";

const FEATURES = [
  {
    icon: "🛒",
    title: "Budget-based grocery lists",
    body: "Every plan comes with a per-week shopping list that fits your grocery budget, with real package sizes and state-adjusted prices.",
  },
  {
    icon: "🎯",
    title: "Calorie & protein targeting",
    body: "Tell us your weight, target, and timeframe — we compute your TDEE and build days that hit your calorie and protein targets.",
  },
  {
    icon: "🔄",
    title: "Meal variety & swaps",
    body: "Multi-week plans stay fresh week to week, and you can swap any meal for an alternative that cooks from the same grocery list.",
  },
  {
    icon: "📖",
    title: "Real recipes",
    body: "An 80-meal library with full ingredients, step-by-step instructions, and USDA-verified macros for every recipe.",
  },
];

const TIER_BLURBS: Record<string, string> = {
  free: "One week of meals and groceries to try it out. No card required.",
  monthly: "A full 30-day plan with swaps, favorites, and weekly grocery lists.",
  annual: "Everything in Monthly, all year long — 37% cheaper than paying monthly.",
};

export default function LandingPage() {
  const router = useRouter();

  // Logged-in visitors don't belong on the marketing page: active subscribers
  // go straight to their plan; everyone else is routed to the right step
  // (choose a plan, onboarding, or the paywall).
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      const dest = await resolvePostAuthDestination();
      if (active) router.replace(dest);
    });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-white/5 sticky top-0 bg-gray-950/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <span className="text-brand-500 text-xl">⚡</span>
          <span className="font-bold text-lg tracking-tight">Campus Macros</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center px-4 pt-20 pb-16 text-center">
        <div className="mb-6 inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-brand-400 text-sm font-medium">
            Built for college students
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight max-w-3xl">
          Eat well.{" "}
          <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
            Hit your macros.
          </span>
          <br />
          Stay on budget.
        </h1>

        <p className="mt-6 text-gray-400 text-lg sm:text-xl max-w-xl leading-relaxed">
          Campus Macros builds personalized weekly meal plans that hit your
          calorie and protein targets within your grocery budget — complete
          with recipes and a shopping list.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/signup"
            className="bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-brand-500/20 flex items-center gap-2"
          >
            Start your free trial
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </Link>
          <span className="text-sm text-gray-500">
            Free 7-day plan · No card required
          </span>
        </div>

        {/* Trust signals */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-gray-500 text-sm">
          {["USDA-verified macros", "80 real recipes with steps", "Budget-first approach"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-extrabold text-center mb-3">
            Everything you need to{" "}
            <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
              eat right on a budget
            </span>
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-lg mx-auto">
            Tell us your budget, goal, and dietary needs — we handle the
            planning, the math, and the shopping list.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white/[0.04] border border-white/8 rounded-2xl p-6"
              >
                <span className="text-2xl">{f.icon}</span>
                <h3 className="text-white font-bold mt-3 mb-1.5">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-4 py-16 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-extrabold text-center mb-3">
            Simple pricing
          </h2>
          <p className="text-gray-500 text-center mb-12">
            Start free. Upgrade when you&apos;re ready.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {planTiers.map((t) => (
              <div
                key={t.id}
                className={`rounded-2xl border p-6 flex flex-col ${
                  t.badge === "Best Value"
                    ? "bg-brand-500/10 border-brand-500/40"
                    : "bg-white/[0.04] border-white/10"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-300">{t.label}</span>
                  {t.badge && (
                    <span className="text-[10px] bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-full px-2 py-0.5 leading-none">
                      {t.badge}
                    </span>
                  )}
                </div>
                <p className="text-3xl font-extrabold text-white">
                  {t.price === 0 ? "Free" : `$${t.price}`}
                  {t.price > 0 && (
                    <span className="text-sm font-medium text-gray-500">
                      /{t.id === "annual" ? "year" : "month"}
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-400 leading-relaxed mt-3 flex-1">
                  {TIER_BLURBS[t.id]}
                </p>
                <Link
                  href="/signup"
                  className={`mt-5 text-center text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors ${
                    t.badge === "Best Value"
                      ? "bg-brand-500 hover:bg-brand-600 text-white"
                      : "bg-white/8 hover:bg-white/12 border border-white/10 text-white"
                  }`}
                >
                  {t.price === 0 ? "Start free" : "Get started"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 py-16 border-t border-white/5 text-center">
        <h2 className="text-3xl font-extrabold mb-4">
          Ready to hit your macros?
        </h2>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-brand-500/20"
        >
          Create your account
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
          </svg>
        </Link>
      </section>

      <PageFooter />
    </main>
  );
}
