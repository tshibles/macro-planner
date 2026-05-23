"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { generatePlan } from "@/app/lib/generatePlan";
import { getTierById } from "@/app/data/plans";
import { UserButton } from "@/app/components/UserButton";
import { calculateTDEE, getCalorieTarget } from "@/app/lib/tdee";
import { STATE_MULTIPLIERS, STATE_NAMES } from "@/app/data/stateMultipliers";
import { lookupIngredientPrice } from "@/app/data/ingredientPrices";
import { Ingredient } from "@/app/data/meals";

interface GroceryItem {
  name: string;
  amounts: string[];
  count: number;
  unitPrice: number;  // state-adjusted price per use
  basePrice: number;
  total: number;
}

function computeGroceryList(
  budget: number,
  goal: string,
  diet: string,
  tierDays: number,
  calorieTarget: number | undefined,
  stateCode: string
): GroceryItem[] {
  const plan = generatePlan(budget, goal, diet, tierDays, calorieTarget);
  const week1 = plan.weeks[0] ?? [];
  const multiplier = STATE_MULTIPLIERS[stateCode] ?? 1.0;

  // Collect every ingredient from every meal in week 1
  const allIngredients: Ingredient[] = [];
  for (const day of week1) {
    for (const meal of [day.breakfast, day.lunch, day.dinner, day.snack]) {
      for (const ing of meal.ingredients) {
        allIngredients.push(ing);
      }
    }
  }

  // Consolidate by normalized ingredient name
  const map = new Map<string, { amounts: string[]; count: number }>();
  for (const ing of allIngredients) {
    const key = normalizeKey(ing.item);
    const existing = map.get(key);
    if (existing) {
      existing.amounts.push(ing.amount);
      existing.count += 1;
    } else {
      map.set(key, { amounts: [ing.amount], count: 1 });
    }
  }

  const items: GroceryItem[] = Array.from(map.entries()).map(([key, { amounts, count }]) => {
    const basePrice = lookupIngredientPrice(key);
    const unitPrice = +(basePrice * multiplier).toFixed(2);
    const total = +(unitPrice * count).toFixed(2);
    return { name: key, amounts, count, basePrice, unitPrice, total };
  });

  // Sort by total cost descending
  items.sort((a, b) => b.total - a.total);
  return items;
}

function normalizeKey(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, "")
    .replace(/,.*$/, "")
    .trim()
    .toLowerCase()
    // Title-case for display
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .toLowerCase();
}

function displayName(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Grocery Content ─────────────────────────────────────────────────────────

function GroceryContent() {
  const router = useRouter();
  const params = useSearchParams();

  const budget = parseFloat(params.get("budget") || "50");
  const goal = params.get("goal") || "";
  const diet = params.get("diet") || "";
  const tierParam = params.get("tier") || "free";
  const weightParam = params.get("weight") || "";
  const heightFtParam = params.get("heightFt") || "";
  const heightInParam = params.get("heightIn") || "";
  const genderParam = params.get("gender") || "";
  const stateParam = params.get("state") || "";

  const tier = getTierById(tierParam);

  const hasMetrics = weightParam && heightFtParam && genderParam;
  const tdee = hasMetrics
    ? calculateTDEE(
        parseFloat(weightParam),
        parseInt(heightFtParam),
        parseInt(heightInParam || "0"),
        genderParam
      )
    : null;
  const calorieTarget = tdee ? getCalorieTarget(tdee, goal) : undefined;

  const stateMultiplier = STATE_MULTIPLIERS[stateParam] ?? 1.0;
  const stateName = STATE_NAMES[stateParam] ?? null;

  const groceryItems = useMemo(
    () => computeGroceryList(budget, goal, diet, tier.days, calorieTarget, stateParam),
    [budget, goal, diet, tier.days, calorieTarget, stateParam]
  );

  const totalCost = useMemo(
    () => groceryItems.reduce((s, i) => s + i.total, 0),
    [groceryItems]
  );

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Save grocery list to Supabase on mount
  useEffect(() => {
    setSaving(true);
    fetch("/api/grocery/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budget: String(budget),
        goal,
        diet,
        tier: tierParam,
        weight: weightParam || null,
        heightFt: heightFtParam || null,
        heightIn: heightInParam || null,
        gender: genderParam || null,
        state: stateParam || null,
        groceryList: groceryItems.map((i) => ({
          name: i.name,
          count: i.count,
          unitPrice: i.unitPrice,
          total: i.total,
        })),
      }),
    })
      .then(() => setSaved(true))
      .catch(() => {})
      .finally(() => setSaving(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function buildPlanParams() {
    const p = new URLSearchParams({ budget: String(budget), goal, diet, tier: tierParam });
    if (weightParam) p.set("weight", weightParam);
    if (heightFtParam) p.set("heightFt", heightFtParam);
    if (heightInParam) p.set("heightIn", heightInParam);
    if (genderParam) p.set("gender", genderParam);
    if (stateParam) p.set("state", stateParam);
    return p;
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-white/5 sticky top-0 bg-gray-950/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/plan?${buildPlanParams().toString()}`)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Back to plan
          </button>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-brand-500">⚡</span>
          <span className="font-bold text-sm tracking-tight">Macro Planner</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
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
          <UserButton />
        </div>
      </nav>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
            Weekly{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Grocery List
            </span>
          </h1>
          <p className="text-sm text-gray-500 mb-3">
            All ingredients from your Week 1 meal plan, consolidated and priced.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
              {tier.days}-day plan · Week 1
            </span>
            <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
              {groceryItems.length} unique ingredients
            </span>
            {stateName && (
              <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                {stateName} · {stateMultiplier >= 1 ? "+" : ""}{Math.round((stateMultiplier - 1) * 100)}% regional
              </span>
            )}
          </div>
        </div>

        {/* Total cost banner */}
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-400/80 uppercase tracking-wider font-medium mb-1">
              Est. weekly grocery total
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
          </div>
        </div>

        {/* Ingredient table */}
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-white/[0.03] border-b border-white/8 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span className="col-span-5">Ingredient</span>
            <span className="col-span-2 text-center">Qty</span>
            <span className="col-span-2 text-right">Unit price</span>
            <span className="col-span-3 text-right">Total</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/5">
            {groceryItems.map((item) => (
              <div
                key={item.name}
                className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-white/[0.02] transition-colors"
              >
                <div className="col-span-5 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{displayName(item.name)}</p>
                  <p className="text-xs text-gray-600 truncate">
                    {Array.from(new Set(item.amounts)).slice(0, 2).join(", ")}
                    {Array.from(new Set(item.amounts)).length > 2 ? "…" : ""}
                  </p>
                </div>
                <div className="col-span-2 text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/8 text-gray-300 text-xs font-semibold">
                    {item.count}×
                  </span>
                </div>
                <div className="col-span-2 text-right">
                  <span className="text-sm text-gray-400">${item.unitPrice.toFixed(2)}</span>
                </div>
                <div className="col-span-3 text-right">
                  <span className="text-sm font-semibold text-white">${item.total.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer total */}
          <div className="grid grid-cols-12 gap-2 px-5 py-4 bg-white/[0.04] border-t border-white/10 items-center">
            <span className="col-span-5 text-sm font-bold text-white">Total</span>
            <span className="col-span-2 text-center text-xs text-gray-600">
              {groceryItems.reduce((s, i) => s + i.count, 0)} uses
            </span>
            <span className="col-span-2" />
            <span className="col-span-3 text-right text-lg font-extrabold text-emerald-300">
              ${totalCost.toFixed(2)}
            </span>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-600 text-center">
          Prices are per-serving estimates. Actual retail prices vary by store and brand.
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

      <footer className="px-6 py-4 text-center text-xs text-gray-600 border-t border-white/5">
        © {new Date().getFullYear()} Macro Planner · Built for college students
      </footer>
    </main>
  );
}

export default function GroceryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Building your grocery list…</div>
      </div>
    }>
      <GroceryContent />
    </Suspense>
  );
}
