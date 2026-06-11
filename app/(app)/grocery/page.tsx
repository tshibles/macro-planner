"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { DayMeals, MealPlan } from "@/app/lib/generatePlan";
import { getTierById } from "@/app/data/plans";
import { buildSavedPlanParams } from "@/app/lib/savedPlanParams";
import { resolvePostAuthDestination } from "@/app/lib/postAuth";
import { calculateTDEE, getCalorieTarget } from "@/app/lib/tdee";
import { STATE_MULTIPLIERS, STATE_NAMES } from "@/app/data/stateMultipliers";
import { isPantryStaple } from "@/app/data/purchasableUnits";
import { normalizeKey } from "@/app/lib/normalizeIngredient";

function extractPantryItems(weekDays: DayMeals[]): string[] {
  const seen = new Set<string>();
  for (const day of weekDays) {
    for (const meal of [day.breakfast, day.lunch, day.dinner, day.snack]) {
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key)) seen.add(key);
      }
    }
  }
  return Array.from(seen).sort();
}

function displayName(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Grocery Content ─────────────────────────────────────────────────────────

function GroceryContent() {
  const router = useRouter();
  const params = useSearchParams();

  const budget = parseFloat(params.get("budget") || "50");
  const numberOfPeople = parseInt(params.get("people") || "1");
  const goal = params.get("goal") || "";
  const dietsParam = params.get("diets") || "";
  const selectedDiets = dietsParam ? dietsParam.split(",").filter(Boolean) : [];
  const tierParam = params.get("tier") || "free";
  const ageParam = params.get("age") || "";
  const activityLevelParam = params.get("activityLevel") || "";
  const allergiesParam = params.get("allergies") || "";
  const weightParam = params.get("weight") || "";
  const heightFtParam = params.get("heightFt") || "";
  const heightInParam = params.get("heightIn") || "";
  const genderParam = params.get("gender") || "";
  const stateParam = params.get("state") || "";
  const targetWeightParam = params.get("targetWeight") || "";
  const goalTimeframeParam = params.get("goalTimeframe") || "";
  // Same salt the plan page used — guarantees this page regenerates the
  // identical plan and cart, so the two totals always match.
  const saltParam = params.get("salt") || "";
  const planSalt = saltParam ? parseInt(saltParam, 10) : 0;

  const tier = getTierById(tierParam);

  // Must mirror the plan page's calorie-target computation exactly — any
  // difference reintroduces the plan-vs-grocery cost mismatch.
  const hasMetrics = weightParam && heightFtParam && genderParam;
  const tdee = hasMetrics
    ? calculateTDEE(
        parseFloat(weightParam),
        parseInt(heightFtParam),
        parseInt(heightInParam || "0"),
        genderParam,
        ageParam ? parseInt(ageParam) : 20,
        activityLevelParam ? parseFloat(activityLevelParam) : 1.55
      )
    : null;
  const goalTarget =
    weightParam && targetWeightParam && goalTimeframeParam
      ? {
          weightLbs: parseFloat(weightParam),
          targetWeightLbs: parseFloat(targetWeightParam),
          timeframeWeeks: parseFloat(goalTimeframeParam),
        }
      : undefined;
  const calorieTarget = tdee ? getCalorieTarget(tdee, goal, goalTarget) : undefined;

  const stateMultiplier = STATE_MULTIPLIERS[stateParam] ?? 1.0;
  const stateName = STATE_NAMES[stateParam] ?? null;

  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [budgetCapMessage, setBudgetCapMessage] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  // Mirrors the meal plan page's week navigation — each week has its own cart.
  const [currentWeek, setCurrentWeek] = useState(0);

  // Bare visit from the nav bar (no params, or no salt): rebuild the URL from
  // the saved row so this page regenerates the exact same plan and cart as the
  // plan page. Generating without the saved salt would silently produce a
  // different cart.
  const needsRestore = !params.get("budget") || !saltParam;

  useEffect(() => {
    if (!needsRestore) return;
    fetch("/api/meal-plans/saved")
      .then((r) => r.json())
      .then(async ({ plan: saved }) => {
        if (!saved) {
          // No saved plan: subscribed users go fill out the form; everyone
          // else gets the same routing the AppShell gate would apply.
          const dest = await resolvePostAuthDestination();
          router.replace(dest === "/plan" ? "/onboarding" : dest);
          return;
        }
        if (saved.plan_salt == null) {
          // No salt persisted yet — let the plan page mint and save one first.
          router.replace("/plan");
          return;
        }
        const sub = await fetch("/api/subscriptions/status")
          .then((r) => r.json())
          .catch(() => ({}));
        const tierOverride = sub?.tier ? getTierById(sub.tier).id : undefined;
        const restored = buildSavedPlanParams(saved, tierOverride);
        restored.set("salt", String(saved.plan_salt));
        window.location.replace(`/grocery?${restored.toString()}`);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (needsRestore) return;
    let cancelled = false;
    fetch("/api/generate-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budget,
        numberOfPeople,
        goal,
        diets: selectedDiets,
        allergies: allergiesParam ? allergiesParam.split(",").map((s) => s.trim()).filter(Boolean) : [],
        totalDays: tier.days,
        stateCode: stateParam,
        calorieTarget,
        weightLbs: weightParam ? parseFloat(weightParam) : undefined,
        planSalt,
      }),
    })
      .then((r) => r.json())
      .then((data: MealPlan) => {
        if (cancelled) return;
        setPlan(data);
        if (data.budgetCapMessage) setBudgetCapMessage(data.budgetCapMessage);
        setPlanLoading(false);
      })
      .catch(() => setPlanLoading(false));
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const weekCart = plan?.weeklyCarts?.[currentWeek];
  const cartItems = weekCart?.items ?? [];
  const totalCost = weekCart?.totalCost ?? 0;

  // Pantry staples come from the viewed week's meals, like the cart.
  const pantryItems = useMemo(
    () => extractPantryItems(plan?.weeks?.[currentWeek] ?? []),
    [plan, currentWeek]
  );

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The DB stores a single list — save week 1's cart, independent of the
    // week being viewed.
    const week1Items = plan?.weeklyCarts?.[0]?.items ?? [];
    if (planLoading || week1Items.length === 0) return;
    setSaving(true);
    fetch("/api/grocery/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budget: String(budget),
        goal,
        diets: selectedDiets,
        tier: tierParam,
        age: ageParam || null,
        activityLevel: activityLevelParam || null,
        allergies: allergiesParam || null,
        weight: weightParam || null,
        heightFt: heightFtParam || null,
        heightIn: heightInParam || null,
        gender: genderParam || null,
        state: stateParam || null,
        targetWeight: targetWeightParam || null,
        goalTimeframe: goalTimeframeParam || null,
        groceryList: week1Items.map((i) => ({
          name: i.key,
          count: i.packages,
          unitPrice: i.pricePerUnit,
          total: i.totalCost,
        })),
      }),
    })
      .then(() => setSaved(true))
      .catch(() => {})
      .finally(() => setSaving(false));
  }, [planLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort by category then cost for display
  const sortedItems = useMemo(
    () => [...cartItems].sort((a, b) => b.totalCost - a.totalCost),
    [cartItems]
  );

  if (planLoading) {
    return (
      <div className="flex-1 min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Building your grocery list…</div>
      </div>
    );
  }

  function buildPlanParams() {
    const p = new URLSearchParams({ budget: String(budget), people: String(numberOfPeople), goal, tier: tierParam });
    if (dietsParam) p.set("diets", dietsParam);
    if (ageParam) p.set("age", ageParam);
    if (activityLevelParam) p.set("activityLevel", activityLevelParam);
    if (allergiesParam) p.set("allergies", allergiesParam);
    if (weightParam) p.set("weight", weightParam);
    if (heightFtParam) p.set("heightFt", heightFtParam);
    if (heightInParam) p.set("heightIn", heightInParam);
    if (genderParam) p.set("gender", genderParam);
    if (stateParam) p.set("state", stateParam);
    if (targetWeightParam) p.set("targetWeight", targetWeightParam);
    if (goalTimeframeParam) p.set("goalTimeframe", goalTimeframeParam);
    if (saltParam) p.set("salt", saltParam);
    return p;
  }

  const numWeeks = plan?.numWeeks ?? 1;
  const totalPlanCost = plan?.totalPlanCost ?? totalCost;

  return (
    <main className="flex-1 flex flex-col">
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
              Weekly{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                Grocery List
              </span>
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-2 flex-shrink-0">
              {saving ? (
                <>
                  <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </>
              ) : saved ? (
                <>
                  <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span className="text-emerald-600">Saved</span>
                </>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            {numWeeks > 1
              ? `Your shopping list for week ${currentWeek + 1} — each week's list matches that week's meals.`
              : "Your shopping list for the week — matched to your meal plan."}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
              {sortedItems.length} items to buy
            </span>
            {numWeeks > 1 && (
              <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                {numWeeks} weeks total
              </span>
            )}
            {stateName && (
              <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                {stateName} · {stateMultiplier >= 1 ? "+" : ""}{Math.round((stateMultiplier - 1) * 100)}% regional
              </span>
            )}
          </div>
        </div>

        {/* Week navigation — mirrors the meal plan page */}
        {numWeeks > 1 && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentWeek((w) => Math.max(0, w - 1))}
                disabled={currentWeek === 0}
                className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Week {currentWeek + 1}</p>
                <p className="text-xs text-gray-600">of {numWeeks}</p>
              </div>
              <button
                onClick={() => setCurrentWeek((w) => Math.min(numWeeks - 1, w + 1))}
                disabled={currentWeek === numWeeks - 1}
                className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {numWeeks <= 8 && (
              <div className="hidden sm:flex items-center gap-1.5">
                {Array.from({ length: numWeeks }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentWeek(i)}
                    className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                      currentWeek === i
                        ? "bg-brand-500 text-white"
                        : "bg-white/6 text-gray-400 hover:bg-white/12 hover:text-white"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Total cost banner */}
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-400/80 uppercase tracking-wider font-medium mb-1">
              {numWeeks > 1 ? `Est. week ${currentWeek + 1} grocery total` : "Est. weekly grocery total"}
            </p>
            <p className="text-4xl font-extrabold text-emerald-300">${totalCost.toFixed(2)}</p>
            {stateName && (
              <p className="text-xs text-emerald-500/60 mt-1">
                Prices adjusted for {stateName} (×{stateMultiplier.toFixed(2)})
              </p>
            )}
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 text-right">
            <p className="text-xs text-gray-600">Budget: ${budget}/wk</p>
            <p className={`text-sm font-semibold ${totalCost <= budget ? "text-emerald-400" : "text-red-400"}`}>
              {totalCost <= budget
                ? `$${(budget - totalCost).toFixed(2)} under budget`
                : `$${(totalCost - budget).toFixed(2)} over budget`}
            </p>
            {numWeeks > 1 && (
              <p className="text-xs text-gray-500 mt-1">
                ${totalPlanCost.toFixed(2)} total over {numWeeks} weeks
              </p>
            )}
          </div>
        </div>

        {/* Budget cap warning */}
        {budgetCapMessage && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-amber-300">{budgetCapMessage}</p>
          </div>
        )}

        {/* Main grocery table */}
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden mb-8">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-white/[0.03] border-b border-white/8 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span className="col-span-5">Ingredient</span>
            <span className="col-span-4 text-center">Amount to buy</span>
            <span className="col-span-3 text-right">Total</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/5">
            {sortedItems.map((item) => (
              <div
                key={item.key}
                className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-white/[0.02] transition-colors"
              >
                <div className="col-span-5 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{displayName(item.key)}</p>
                  <p className="text-xs text-gray-600 capitalize">{item.category}</p>
                </div>
                <div className="col-span-4 text-center">
                  <span className="inline-flex items-center justify-center rounded-lg bg-white/8 text-gray-200 text-xs font-semibold px-2.5 py-1">
                    {item.purchaseLabel}
                  </span>
                </div>
                <div className="col-span-3 text-right">
                  <span className="text-sm font-semibold text-white">${item.totalCost.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer total */}
          <div className="grid grid-cols-12 gap-2 px-5 py-4 bg-white/[0.04] border-t border-white/10 items-center">
            <span className="col-span-5 text-sm font-bold text-white">Total</span>
            <span className="col-span-4 text-center text-xs text-gray-600">
              {sortedItems.length} items
            </span>
            <span className="col-span-3 text-right text-lg font-extrabold text-emerald-300">
              ${totalCost.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Pantry Staples section */}
        {pantryItems.length > 0 && (
          <div className="bg-white/[0.02] border border-white/6 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/6">
              <h2 className="text-sm font-bold text-gray-300 mb-1">Pantry Staples</h2>
              <p className="text-xs text-gray-500">
                These are assumed to be on hand. Add them to your cart if you need them.
              </p>
            </div>
            <div className="px-5 py-4 flex flex-wrap gap-2">
              {pantryItems.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center text-xs bg-white/5 border border-white/8 text-gray-400 rounded-full px-3 py-1"
                >
                  {displayName(item)}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-600 text-center">
          Prices are per-package retail estimates. Actual prices vary by store and brand.
          {stateName && ` Regional multiplier applied for ${stateName}.`}
        </p>

        {/* Back button */}
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => router.push(`/plan?${buildPlanParams().toString()}`)}
            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-brand-500/20"
          >
            Back to meal plan
          </button>
        </div>
      </div>
    </main>
  );
}

export default function GroceryPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Building your grocery list…</div>
      </div>
    }>
      <GroceryContent />
    </Suspense>
  );
}
