"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/client";
import { planTiers } from "@/app/data/plans";
import { PageFooter } from "@/app/components/PageHeader";
import { GlowBackdrop, FloatingFood, LogoMark, LeafPattern } from "@/app/components/Decor";

const FEATURES = [
  {
    icon: "🛒",
    tint: "bg-emerald-50 border-emerald-200",
    glow: "hover:border-emerald-400 hover:shadow-emerald-600/10",
    title: "Budget-based grocery lists",
    body: "Every plan comes with a per-week shopping list that fits your grocery budget, with real package sizes and state-adjusted prices.",
  },
  {
    icon: "🎯",
    tint: "bg-sky-50 border-sky-200",
    glow: "hover:border-sky-400 hover:shadow-sky-600/10",
    title: "Calorie & protein targeting",
    body: "Tell us your weight, target, and timeframe — we compute your TDEE and build days that hit your calorie and protein targets.",
  },
  {
    icon: "🔄",
    tint: "bg-violet-50 border-violet-200",
    glow: "hover:border-violet-400 hover:shadow-violet-600/10",
    title: "Meal variety & swaps",
    body: "Multi-week plans stay fresh week to week, and you can swap any meal for an alternative that cooks from the same grocery list.",
  },
  {
    icon: "📖",
    tint: "bg-amber-50 border-amber-200",
    glow: "hover:border-amber-400 hover:shadow-amber-600/10",
    title: "Real recipes",
    body: "A 150+ meal library with full ingredients, step-by-step instructions, and USDA-verified macros for every recipe.",
  },
];

const STEPS = [
  {
    n: "1",
    emoji: "📝",
    title: "Tell us about you",
    body: "Budget, goal weight, dietary needs, and where you shop.",
  },
  {
    n: "2",
    emoji: "🧮",
    title: "We build your plan",
    body: "Days that hit your calories and protein — priced inside your budget.",
  },
  {
    n: "3",
    emoji: "🍳",
    title: "Shop & meal-prep",
    body: "One grocery run and two prep sessions cover your whole week.",
  },
];

const STATS = [
  { value: "150+", label: "real recipes" },
  { value: "50", label: "states priced" },
  { value: "2", label: "prep sessions / week" },
  { value: "$8", label: "per month" },
];

// Illustrative sample day for the hero preview card.
const PREVIEW_MEALS = [
  { emoji: "🍳", slot: "Breakfast", name: "Egg & Potato Hash", kcal: 550 },
  { emoji: "🍝", slot: "Lunch", name: "Turkey Pasta", kcal: 660 },
  { emoji: "🍚", slot: "Dinner", name: "Teriyaki Chicken Bowl", kcal: 540 },
  { emoji: "🥜", slot: "Snack", name: "PB Banana Toast", kcal: 280 },
];

const TIER_BLURBS: Record<string, string> = {
  free: "One week of meals and groceries to try it out. No card required.",
  monthly: "A full 30-day plan with swaps, favorites, and weekly grocery lists.",
  annual: "Everything in Monthly, all year long — 37% cheaper than paying monthly.",
};

export default function LandingPage() {
  // The landing page never auto-redirects — signed-in visitors get a
  // "My plan" shortcut in the nav and hero instead, so everyone can
  // actually enjoy the front door.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setSignedIn(!!data.user);
      });
    return () => {
      active = false;
    };
  }, []);

  const primaryHref = signedIn ? "/plan" : "/signup";
  const primaryLabel = signedIn ? "Open my plan" : "Start your free trial";

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-brand-900/10 sticky top-0 bg-white/85 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-extrabold text-lg tracking-tight text-brand-900">Campus Macros</span>
        </div>
        <div className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-600">
          {[
            ["How it works", "#how-it-works"],
            ["Features", "#features"],
            ["Pricing", "#pricing"],
          ].map(([label, href]) => (
            <a key={href} href={href} className="px-3 py-1.5 rounded-full hover:text-brand-800 hover:bg-brand-50 transition-colors">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {signedIn ? (
            <Link href="/plan" className="btn-primary text-sm px-4 py-1.5">
              My plan →
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-brand-800 px-3 py-1.5 transition-colors"
              >
                Log in
              </Link>
              <Link href="/signup" className="btn-primary text-sm px-4 py-1.5">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-20 pb-24">
        <GlowBackdrop />
        <FloatingFood />
        <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-full px-4 py-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-600 animate-pulse" />
              <span className="text-brand-800 text-sm font-semibold">
                Built for college students
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight text-brand-950">
              Eat well.
              <br />
              <span className="text-fresh">Hit your macros.</span>
              <br />
              Stay on budget.
            </h1>

            <p className="mt-6 text-gray-600 text-lg sm:text-xl max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Personalized weekly meal plans that hit your calorie and protein
              targets within your grocery budget — recipes, prep guide, and
              shopping list included.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center lg:items-start lg:justify-start justify-center gap-4">
              <Link href={primaryHref} className="btn-primary px-8 py-4 text-lg flex items-center gap-2">
                {primaryLabel}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              </Link>
              {!signedIn && (
                <span className="text-sm text-gray-500 sm:self-center">
                  Free 7-day plan · No card required
                </span>
              )}
            </div>

            {/* Trust signals */}
            <div className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-gray-500 text-sm">
              {["USDA-verified macros", "150+ real recipes", "Budget-first"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-brand-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Plan preview card */}
          <div className="relative hidden sm:block" aria-hidden="true">
            <div className="absolute -inset-6 bg-gradient-to-br from-brand-300/40 via-emerald-200/40 to-lime-200/40 rounded-[2.5rem] blur-2xl" />
            <div className="relative bg-white border border-brand-900/10 rounded-3xl shadow-2xl shadow-brand-900/15 p-6 rotate-1 hover:rotate-0 transition-transform duration-300">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-bold text-brand-950">Monday</p>
                  <p className="text-xs text-gray-500">Sample day · 2,030 kcal</p>
                </div>
                <span className="text-xs font-semibold text-brand-800 bg-brand-50 border border-brand-200 rounded-full px-2.5 py-1">
                  $8.40 / day
                </span>
              </div>
              <div className="space-y-2.5">
                {PREVIEW_MEALS.map((m) => (
                  <div key={m.slot} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-2.5">
                    <span className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-lg shadow-sm">
                      {m.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{m.slot}</p>
                      <p className="text-sm font-semibold text-gray-800 truncate">{m.name}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-500">{m.kcal} kcal</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-1.5">
                <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">2,030 kcal</span>
                <span className="text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">142g protein</span>
                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">on budget ✓</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Deep-forest stats band */}
      <section className="relative overflow-hidden forest-panel">
        <LeafPattern />
        <div className="relative z-10 max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 px-6 py-12 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-4xl font-black text-white">{s.value}</p>
              <p className="text-sm text-brand-200 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-4 py-20 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-black text-center text-brand-950 mb-3">
            Three steps to a <span className="text-fresh">healthier week</span>
          </h2>
          <p className="text-gray-500 text-center mb-14">From empty fridge to full meal-prep containers.</p>
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-9 left-[18%] right-[18%] h-0.5 bg-gradient-to-r from-brand-200 via-emerald-300 to-lime-200" aria-hidden="true" />
            {STEPS.map((s) => (
              <div key={s.n} className="relative text-center">
                <span className="relative z-10 inline-flex w-[4.5rem] h-[4.5rem] rounded-2xl bg-white border-2 border-brand-200 shadow-lg shadow-brand-900/10 items-center justify-center text-3xl mb-4">
                  {s.emoji}
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-brand-600 to-emerald-700 text-white text-xs font-bold flex items-center justify-center">
                    {s.n}
                  </span>
                </span>
                <h3 className="font-bold text-brand-950 mb-1.5">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed max-w-[16rem] mx-auto">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative overflow-hidden px-4 py-20 bg-brand-50/50 border-y border-brand-900/5 scroll-mt-20">
        <GlowBackdrop variant="subtle" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <h2 className="text-4xl font-black text-center text-brand-950 mb-3">
            Everything you need to <span className="text-fresh">eat right on a budget</span>
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-lg mx-auto">
            Tell us your budget, goal, and dietary needs — we handle the
            planning, the math, and the shopping list.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`bg-white border border-brand-900/10 rounded-2xl p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl ${f.glow}`}
              >
                <span className={`inline-flex w-12 h-12 items-center justify-center text-2xl rounded-xl border ${f.tint}`}>
                  {f.icon}
                </span>
                <h3 className="text-brand-950 font-bold mt-3 mb-1.5">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-4 py-20 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-black text-center text-brand-950 mb-3">Simple pricing</h2>
          <p className="text-gray-500 text-center mb-12">
            Start free. Upgrade when you&apos;re ready.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-stretch">
            {planTiers.map((t) => {
              const featured = t.badge === "Best Value";
              return (
                <div
                  key={t.id}
                  className={`relative rounded-2xl p-6 flex flex-col transition-all hover:-translate-y-1 ${
                    featured
                      ? "forest-panel shadow-2xl shadow-brand-900/30 sm:scale-105"
                      : "bg-white border border-brand-900/10 shadow-sm hover:shadow-lg"
                  }`}
                >
                  {featured && <LeafPattern className="opacity-[0.05] rounded-2xl" />}
                  <div className="relative z-10 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-bold ${featured ? "text-brand-100" : "text-gray-600"}`}>{t.label}</span>
                      {t.badge && (
                        <span
                          className={`text-[10px] font-bold rounded-full px-2 py-0.5 leading-none ${
                            featured
                              ? "bg-lime-300 text-brand-950"
                              : "bg-brand-50 text-brand-800 border border-brand-200"
                          }`}
                        >
                          {t.badge}
                        </span>
                      )}
                    </div>
                    <p className={`text-4xl font-black ${featured ? "text-white" : "text-brand-950"}`}>
                      {t.price === 0 ? "Free" : `$${t.price}`}
                      {t.price > 0 && (
                        <span className={`text-sm font-medium ${featured ? "text-brand-200" : "text-gray-400"}`}>
                          /{t.id === "annual" ? "year" : "month"}
                        </span>
                      )}
                    </p>
                    <p className={`text-sm leading-relaxed mt-3 flex-1 ${featured ? "text-brand-100" : "text-gray-500"}`}>
                      {TIER_BLURBS[t.id]}
                    </p>
                    <Link
                      href={signedIn ? "/choose-plan" : "/signup"}
                      className={`mt-5 text-center text-sm font-bold px-4 py-2.5 rounded-xl transition-colors ${
                        featured
                          ? "bg-white text-brand-900 hover:bg-brand-50"
                          : "bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-900"
                      }`}
                    >
                      {t.price === 0 ? "Start free" : "Get started"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-20">
        <div className="relative overflow-hidden max-w-4xl mx-auto rounded-[2rem] forest-panel px-8 py-16 text-center shadow-2xl shadow-brand-900/30">
          <LeafPattern />
          <div className="relative z-10">
            <p className="text-5xl mb-4" aria-hidden="true">🥗</p>
            <h2 className="text-4xl font-black mb-3 text-white">
              Ready to hit your macros?
            </h2>
            <p className="text-brand-200 mb-8 max-w-md mx-auto">
              Your first week of meals, macros, and groceries is free.
            </p>
            <Link
              href={primaryHref}
              className="inline-flex items-center gap-2 bg-white text-brand-900 hover:bg-brand-50 font-bold px-8 py-4 rounded-xl transition-colors shadow-lg text-lg"
            >
              {signedIn ? "Open my plan" : "Create your account"}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <PageFooter />
    </main>
  );
}
