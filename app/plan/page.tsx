"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { generatePlan, DayMeals } from "@/app/lib/generatePlan";
import { Meal } from "@/app/data/meals";

const GOAL_LABELS: Record<string, string> = {
  muscle_gain: "Build Muscle",
  fat_loss: "Lose Fat",
  maintenance: "Maintain Weight",
  endurance: "Improve Endurance",
  general_health: "General Health",
};

const DIET_LABELS: Record<string, string> = {
  "": "No restrictions",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  gluten_free: "Gluten-Free",
  dairy_free: "Dairy-Free",
  halal: "Halal",
  kosher: "Kosher",
};

const MEAL_ICONS: Record<string, string> = {
  breakfast: "☀️",
  lunch: "🥗",
  dinner: "🍽️",
  snack: "🍎",
};

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function MacroBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${color}`}>
      <span className="opacity-60">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function MealRow({ meal }: { meal: Meal }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="text-lg w-7 flex-shrink-0">{MEAL_ICONS[meal.type]}</span>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            {MEAL_LABELS[meal.type]}
          </p>
          <p className="text-sm text-white font-medium leading-snug">{meal.name}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end ml-9 sm:ml-0">
        <MacroBadge label="kcal" value={meal.calories} color="bg-white/8 text-gray-300" />
        <MacroBadge label="P" value={`${meal.protein}g`} color="bg-blue-500/15 text-blue-300" />
        <MacroBadge label="C" value={`${meal.carbs}g`} color="bg-amber-500/15 text-amber-300" />
        <MacroBadge label="F" value={`${meal.fat}g`} color="bg-purple-500/15 text-purple-300" />
        <span className="text-xs text-gray-500 ml-1">${meal.cost.toFixed(2)}</span>
      </div>
    </div>
  );
}

function DayCard({ dayPlan }: { dayPlan: DayMeals }) {
  return (
    <div className="bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 bg-white/[0.03] border-b border-white/8 flex items-center justify-between">
        <h3 className="font-semibold text-white">{dayPlan.day}</h3>
        <span className="text-xs text-gray-500">${dayPlan.dailyCost.toFixed(2)}</span>
      </div>
      <div className="px-5">
        <MealRow meal={dayPlan.breakfast} />
        <MealRow meal={dayPlan.lunch} />
        <MealRow meal={dayPlan.dinner} />
        <MealRow meal={dayPlan.snack} />
      </div>
      {/* Daily totals */}
      <div className="px-5 py-3 bg-white/[0.02] border-t border-white/8 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 mr-1 font-medium uppercase tracking-wider">Daily total</span>
        <MacroBadge label="kcal" value={dayPlan.dailyCalories.toLocaleString()} color="bg-white/8 text-gray-200" />
        <MacroBadge label="P" value={`${dayPlan.dailyProtein}g`} color="bg-blue-500/15 text-blue-300" />
        <MacroBadge label="C" value={`${dayPlan.dailyCarbs}g`} color="bg-amber-500/15 text-amber-300" />
        <MacroBadge label="F" value={`${dayPlan.dailyFat}g`} color="bg-purple-500/15 text-purple-300" />
      </div>
    </div>
  );
}

function LockOverlay({ onUnlock, loading }: { onUnlock: () => void; loading: boolean }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
      style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(3,7,18,0.7) 20%, rgba(3,7,18,0.95) 50%)" }}>
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-white/8 border border-white/12 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <p className="text-white font-bold text-lg">Days 2–7 are locked</p>
          <p className="text-gray-400 text-sm mt-1 max-w-xs">
            Unlock your complete 7-day plan — a one-time purchase, no subscription.
          </p>
        </div>
        <button
          onClick={onUnlock}
          disabled={loading}
          className="mt-1 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 text-white font-semibold px-7 py-3 rounded-xl transition-colors shadow-lg shadow-brand-500/30 flex items-center gap-2 text-sm"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Redirecting to checkout…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M2.5 4A1.5 1.5 0 001 5.5v1A1.5 1.5 0 002.5 8h15A1.5 1.5 0 0019 6.5v-1A1.5 1.5 0 0017.5 4h-15zM1 10.5A1.5 1.5 0 012.5 9h15a1.5 1.5 0 010 3h-15A1.5 1.5 0 011 10.5zM2.5 14a1.5 1.5 0 000 3h15a1.5 1.5 0 000-3h-15z" />
              </svg>
              Unlock Full Plan — $17
            </>
          )}
        </button>
        <p className="text-xs text-gray-600 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Secure payment via Stripe
        </p>
      </div>
    </div>
  );
}

function PlanContent() {
  const router = useRouter();
  const params = useSearchParams();

  const budget = parseFloat(params.get("budget") || "50");
  const goal = params.get("goal") || "";
  const diet = params.get("diet") || "";
  const paidParam = params.get("paid") === "true";

  const [unlocked, setUnlocked] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    // Check if already unlocked this session
    const sessionKey = `paid_${budget}_${goal}_${diet}`;
    if (paidParam || sessionStorage.getItem(sessionKey) === "true") {
      sessionStorage.setItem(sessionKey, "true");
      setUnlocked(true);
      // Clean ?paid=true from the URL without a reload
      if (paidParam) {
        const clean = new URLSearchParams({ budget: String(budget), goal, diet });
        router.replace(`/plan?${clean.toString()}`);
      }
    }
  }, [paidParam, budget, goal, diet, router]);

  const plan = generatePlan(budget, goal, diet);

  const budgetDiff = +(budget - plan.weeklyEstimatedCost).toFixed(2);
  const underBudget = budgetDiff >= 0;

  async function handleUnlock() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: String(budget),
          goal,
          diet,
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setCheckoutLoading(false);
    }
  }

  const freeDay = plan.days[0];
  const lockedDays = plan.days.slice(1);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-white/5 sticky top-0 bg-gray-950/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Back
          </button>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-brand-500">⚡</span>
          <span className="font-bold text-sm tracking-tight">Macro Planner</span>
        </div>
        <button
          onClick={() => router.push("/")}
          className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors"
        >
          New plan
        </button>
      </nav>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
            Your 7-Day{" "}
            <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
              Meal Plan
            </span>
          </h1>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
              ${budget}/week budget
            </span>
            {goal && (
              <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                {GOAL_LABELS[goal]}
              </span>
            )}
            <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
              {DIET_LABELS[diet]}
            </span>
          </div>
        </div>

        {/* Weekly summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl px-5 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Est. weekly cost</p>
            <p className={`text-2xl font-bold ${underBudget ? "text-brand-400" : "text-red-400"}`}>
              ${plan.weeklyEstimatedCost.toFixed(2)}
            </p>
            <p className="text-xs mt-1 text-gray-500">
              {underBudget
                ? `$${budgetDiff.toFixed(2)} under your $${budget} budget`
                : `$${Math.abs(budgetDiff).toFixed(2)} over your $${budget} budget`}
            </p>
          </div>
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl px-5 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Avg. daily calories</p>
            <p className="text-2xl font-bold text-white">{plan.avgDailyCalories.toLocaleString()}</p>
            <p className="text-xs mt-1 text-gray-500">kcal per day</p>
          </div>
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl px-5 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Avg. daily protein</p>
            <p className="text-2xl font-bold text-blue-300">{plan.avgDailyProtein}g</p>
            <p className="text-xs mt-1 text-gray-500">protein per day</p>
          </div>
        </div>

        {/* Day cards */}
        {/* Day 1 — always free */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <DayCard dayPlan={freeDay} />
        </div>

        {/* Days 2–7 — locked or unlocked */}
        {unlocked ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {lockedDays.map((dayPlan) => (
              <DayCard key={dayPlan.day} dayPlan={dayPlan} />
            ))}
          </div>
        ) : (
          <div className="relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 blur-sm pointer-events-none select-none" aria-hidden>
              {lockedDays.map((dayPlan) => (
                <DayCard key={dayPlan.day} dayPlan={dayPlan} />
              ))}
            </div>
            <LockOverlay onUnlock={handleUnlock} loading={checkoutLoading} />
          </div>
        )}

        {/* Regenerate */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-sm text-gray-500">Not happy with the plan?</p>
          <button
            onClick={() => router.push("/")}
            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-brand-500/20"
          >
            Adjust my preferences
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-xs text-gray-600 border-t border-white/5">
        © {new Date().getFullYear()} Macro Planner · Built for college students
      </footer>
    </main>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Building your plan…</div>
      </div>
    }>
      <PlanContent />
    </Suspense>
  );
}
