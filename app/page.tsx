"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { planTiers } from "@/app/data/plans";
import { UserButton } from "@/app/components/UserButton";

const fitnessGoals = [
  { value: "", label: "Select a goal..." },
  { value: "muscle_gain", label: "Build Muscle" },
  { value: "fat_loss", label: "Lose Fat" },
  { value: "maintenance", label: "Maintain Weight" },
  { value: "endurance", label: "Improve Endurance" },
  { value: "general_health", label: "General Health" },
];

const dietaryRestrictions = [
  { value: "", label: "No restrictions" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten_free", label: "Gluten-Free" },
  { value: "dairy_free", label: "Dairy-Free" },
];

export default function Home() {
  const router = useRouter();
  const posthog = usePostHog();
  const [budget, setBudget] = useState("");
  const [goal, setGoal] = useState("");
  const [diet, setDiet] = useState("");
  const [tier, setTier] = useState("free");
  const [loading, setLoading] = useState(false);
  const [freeTrialUsed, setFreeTrialUsed] = useState(false);
  const [trialCheckDone, setTrialCheckDone] = useState(false);
  const [savedPlanUrl, setSavedPlanUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/free-trial/status")
      .then((r) => r.json())
      .then((data) => {
        const used = data.used ?? false;
        setFreeTrialUsed(used);
        if (used) {
          setTier("starter");
          return fetch("/api/meal-plans/saved")
            .then((r) => r.json())
            .then(({ plan }) => {
              if (plan) {
                const p = new URLSearchParams({
                  budget: String(plan.budget),
                  goal: plan.goal ?? "",
                  diet: plan.diet ?? "",
                  tier: plan.tier ?? "free",
                });
                setSavedPlanUrl(`/plan?${p.toString()}`);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setTrialCheckDone(true));
  }, []);

  const selectedTier = planTiers.find((t) => t.id === tier) ?? planTiers[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const params = new URLSearchParams({
      budget: budget || "50",
      goal,
      diet,
      tier,
    });

    const planProps = { budget: budget || "50", goal, diet, tier };

    if (selectedTier.priceInCents === 0) {
      const res = await fetch("/api/free-trial/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: budget || "50", goal, diet }),
      });
      if (!res.ok) {
        setFreeTrialUsed(true);
        setTier("starter");
        setLoading(false);
        return;
      }
      posthog.capture("plan_generated", planProps);
      router.push(`/plan?${params.toString()}`);
      return;
    }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: budget || "50",
          goal,
          diet,
          tier,
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.url) {
        posthog.capture("plan_generated", planProps);
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-brand-500 text-xl">⚡</span>
          <span className="font-bold text-lg tracking-tight">Macro Planner</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 bg-white/5 px-3 py-1 rounded-full hidden sm:block">
            College-friendly nutrition
          </span>
          <UserButton />
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="mb-6 inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-brand-400 text-sm font-medium">
            80-meal library with full recipes
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold text-center leading-tight max-w-3xl">
          Eat well.{" "}
          <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
            Hit your macros.
          </span>
          <br />
          Stay on budget.
        </h1>

        <p className="mt-6 text-gray-400 text-lg sm:text-xl text-center max-w-xl leading-relaxed">
          Tell us your budget, goal, and dietary needs — get a full meal plan with
          accurate macros, ingredients, and step-by-step recipes.
        </p>

        {/* Form Card */}
        <div className="mt-12 w-full max-w-lg bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Budget */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="budget" className="text-sm font-medium text-gray-300">
                Weekly grocery budget
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                <input
                  id="budget"
                  type="number"
                  min={10}
                  max={500}
                  step={5}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="50"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition"
                />
              </div>
            </div>

            {/* Fitness Goal */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="goal" className="text-sm font-medium text-gray-300">
                Fitness goal
              </label>
              <select
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer"
              >
                {fitnessGoals.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-gray-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dietary Restrictions */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="diet" className="text-sm font-medium text-gray-300">
                Dietary restrictions
              </label>
              <select
                id="diet"
                value={diet}
                onChange={(e) => setDiet(e.target.value)}
                className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer"
              >
                {dietaryRestrictions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-gray-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Plan Length */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">Plan length</label>
              {!trialCheckDone ? (
                <div className="h-[200px] rounded-xl bg-white/[0.02] border border-white/10 animate-pulse" />
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {planTiers.map((t) => {
                    const isFreeTierDisabled = t.id === "free" && freeTrialUsed;
                    return (
                      <label
                        key={t.id}
                        className={`relative flex items-center justify-between gap-3 rounded-xl px-4 py-3 border transition-all ${
                          isFreeTierDisabled
                            ? "border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
                            : tier === t.id
                            ? "border-brand-500/60 bg-brand-500/10 cursor-pointer"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                              isFreeTierDisabled
                                ? "border-gray-700"
                                : tier === t.id
                                ? "border-brand-500 bg-brand-500"
                                : "border-gray-600"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white">{t.label}</span>
                              {isFreeTierDisabled ? (
                                <span className="text-xs bg-gray-700/50 text-gray-500 border border-gray-600/30 rounded-full px-1.5 py-0.5 leading-none">
                                  Used
                                </span>
                              ) : t.badge ? (
                                <span className="text-xs bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-full px-1.5 py-0.5 leading-none">
                                  {t.badge}
                                </span>
                              ) : null}
                            </div>
                            <span className="text-xs text-gray-500">{t.description}</span>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-200 flex-shrink-0">
                          {t.price === 0 ? "Free" : `$${t.price}`}
                        </span>
                        <input
                          type="radio"
                          name="tier"
                          value={t.id}
                          checked={tier === t.id}
                          disabled={isFreeTierDisabled}
                          onChange={() => !isFreeTierDisabled && setTier(t.id)}
                          className="sr-only"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {freeTrialUsed && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Your free trial has been used. Choose a plan above to continue.
                </p>
                {savedPlanUrl && (
                  <a
                    href={savedPlanUrl}
                    className="text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2 text-center transition-colors"
                  >
                    View your saved 7-day plan
                  </a>
                )}
              </div>
            )}

            {/* CTA */}
            <button
              type="submit"
              disabled={loading || !trialCheckDone}
              className="mt-2 w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors duration-150 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {selectedTier.priceInCents > 0 ? "Redirecting to checkout…" : "Building your plan…"}
                </>
              ) : (
                <>
                  {selectedTier.priceInCents > 0
                    ? `Get ${selectedTier.days}-Day Plan — $${selectedTier.price}`
                    : "Generate Free 7-Day Plan"}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Trust signals */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-gray-500 text-sm">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            USDA-verified macros
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            80 real recipes with steps
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            Budget-first approach
          </span>
        </div>
      </section>

      <footer className="px-6 py-4 text-center text-xs text-gray-600 border-t border-white/5">
        © {new Date().getFullYear()} Macro Planner · Built for college students
      </footer>
    </main>
  );
}
