"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePostHog } from "posthog-js/react";
import type { DayMeals, MealPlan, PrepSession, PrepRecipe, SlotSource } from "@/app/lib/generatePlan";
import { findSwapAlternatives } from "@/app/lib/generatePlan";
import { Meal, MealType } from "@/app/data/meals";
import { getTierById, planTiers } from "@/app/data/plans";
import { buildSavedPlanParams } from "@/app/lib/savedPlanParams";
import { resolvePostAuthDestination } from "@/app/lib/postAuth";
import { calculateTDEE, getCalorieTarget } from "@/app/lib/tdee";
import { STATE_NAMES } from "@/app/data/stateMultipliers";

const GOAL_LABELS: Record<string, string> = {
  muscle_gain: "Build Muscle",
  fat_loss: "Lose Fat",
  maintenance: "Maintain Weight",
  endurance: "Improve Endurance",
  general_health: "General Health",
};

const DIET_LABELS: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  gluten_free: "Gluten-Free",
  dairy_free: "Dairy-Free",
  pescatarian: "Pescatarian",
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

// Badges marking where each day-slot's meal comes from in the meal-prep model.
const SOURCE_BADGES: Record<SlotSource, { label: string; classes: string }> = {
  "sunday-prep":    { label: "Reheat · Sun prep", classes: "bg-violet-500/15 text-violet-300 border-violet-500/25" },
  "wednesday-prep": { label: "Reheat · Wed prep", classes: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25" },
  fresh:            { label: "Make fresh", classes: "bg-emerald-50 text-emerald-600 border-emerald-300" },
};

// ─── Macro Badge ────────────────────────────────────────────────────────────

function MacroBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${color}`}>
      <span className="opacity-60">{label}</span>
      <span>{value}</span>
    </span>
  );
}

// ─── Recipe Modal ────────────────────────────────────────────────────────────

interface UsdaMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
}

function RecipeModal({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const [usdaMacros, setUsdaMacros] = useState<UsdaMacros | null>(null);
  const [usdaLoading, setUsdaLoading] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    // Skip USDA lookup for scaled meals — our scaled values are authoritative
    if (meal.portionMultiplier && meal.portionMultiplier !== 1) {
      setUsdaLoading(false);
      return;
    }
    const controller = new AbortController();
    setUsdaLoading(true);
    fetch(`/api/usda?query=${encodeURIComponent(meal.usdaQuery)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setUsdaMacros(data);
      })
      .catch(() => {})
      .finally(() => setUsdaLoading(false));
    return () => controller.abort();
  }, [meal.usdaQuery, meal.portionMultiplier]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const displayMacros = usdaMacros ?? {
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    source: null,
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[85vh] bg-white border border-gray-200 rounded-t-3xl sm:rounded-2xl overflow-y-auto shadow-2xl shadow-brand-900/15 flex flex-col">
        {/* Modal header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{MEAL_ICONS[meal.type]}</span>
              <span className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                {MEAL_LABELS[meal.type]}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{meal.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-50 hover:bg-brand-100 flex items-center justify-center transition-colors mt-1"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-600">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Macro breakdown */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Macro Breakdown
              </h3>
              {meal.portionMultiplier && meal.portionMultiplier !== 1 ? (
                <span className="text-xs text-amber-600/70">
                  ×{meal.portionMultiplier.toFixed(2)} portions
                </span>
              ) : usdaLoading ? (
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Fetching USDA data…
                </span>
              ) : usdaMacros ? (
                <span className="text-xs text-emerald-500/70">USDA FoodData Central</span>
              ) : (
                <span className="text-xs text-gray-400">Estimated</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Calories", value: displayMacros.calories, unit: "kcal", color: "bg-white border-gray-200", text: "text-gray-900" },
                { label: "Protein", value: displayMacros.protein, unit: "g", color: "bg-sky-50 border-blue-500/20", text: "text-sky-700" },
                { label: "Carbs", value: displayMacros.carbs, unit: "g", color: "bg-amber-50 border-amber-300", text: "text-amber-700" },
                { label: "Fat", value: displayMacros.fat, unit: "g", color: "bg-purple-50 border-purple-500/20", text: "text-purple-700" },
              ].map(({ label, value, unit, color, text }) => (
                <div key={label} className={`rounded-xl border px-3 py-3 text-center ${color}`}>
                  <p className={`text-lg font-bold ${text}`}>{value}</p>
                  <p className="text-xs text-gray-500">{unit}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {usdaMacros?.source && (
              <p className="mt-2 text-xs text-gray-400 truncate">
                Matched: &ldquo;{usdaMacros.source}&rdquo;
              </p>
            )}
          </div>

          {/* Ingredients */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Ingredients
            </h3>
            <ul className="space-y-1.5">
              {meal.ingredients.map((ing, i) => (
                <li key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500/60 flex-shrink-0 mt-1.5" />
                  <span className="text-gray-700 flex-1">{ing.item}</span>
                  <span className="text-gray-500 text-xs flex-shrink-0">{ing.amount}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Instructions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Instructions
            </h3>
            <ol className="space-y-3">
              {meal.instructions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-50 border border-brand-300 text-brand-700 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-gray-700 leading-relaxed flex-1">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Batch storage & reheating */}
          {meal.prepType === "batch" && (meal.storageInstructions || meal.reheatInstructions) && (
            <div className="bg-brand-50/50 border border-gray-200 rounded-xl px-4 py-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Meal-Prep Notes
              </h3>
              {meal.batchServings && (
                <p className="text-sm text-gray-600">
                  Batch recipe — one cook makes about {meal.batchServings} servings.
                </p>
              )}
              {meal.storageInstructions && (
                <div className="flex gap-2 text-sm">
                  <span className="flex-shrink-0">🧊</span>
                  <p className="text-gray-600 leading-relaxed">{meal.storageInstructions}</p>
                </div>
              )}
              {meal.reheatInstructions && (
                <div className="flex gap-2 text-sm">
                  <span className="flex-shrink-0">♨️</span>
                  <p className="text-gray-600 leading-relaxed">{meal.reheatInstructions}</p>
                </div>
              )}
            </div>
          )}

          {/* Cost */}
          <div className="pt-2 pb-1 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-500">Estimated cost per serving</span>
            <span className="text-gray-700 font-semibold">${meal.cost.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Meal Card ───────────────────────────────────────────────────────────────

type Rating = "like" | "dislike";

function MealCard({
  meal,
  onClick,
  onSwap,
  rating,
  onRate,
  showRatings,
  source,
}: {
  meal: Meal;
  onClick: () => void;
  onSwap?: () => void;
  rating?: Rating;
  onRate?: (kind: Rating) => void;
  showRatings?: boolean;
  source?: SlotSource;
}) {
  const badge = source ? SOURCE_BADGES[source] : null;
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      className="w-full text-left flex items-center gap-3 py-3 border-b border-brand-900/10 last:border-0 hover:bg-brand-50/40 -mx-1 px-1 rounded-lg transition-colors group cursor-pointer"
    >
      <span className="text-base w-6 flex-shrink-0 text-center">{MEAL_ICONS[meal.type]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider leading-none mb-0.5 flex items-center gap-1.5">
          {MEAL_LABELS[meal.type]}
          {badge && (
            <span className={`normal-case tracking-normal text-[10px] font-medium px-1.5 py-0.5 rounded-md border leading-none ${badge.classes}`}>
              {badge.label}
            </span>
          )}
        </p>
        <p className="text-sm text-gray-900 font-medium leading-snug group-hover:text-brand-700 transition-colors truncate">
          {meal.name}
        </p>
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          <MacroBadge label="kcal" value={meal.calories} color="bg-gray-50 text-gray-600" />
          <MacroBadge label="P" value={`${meal.protein}g`} color="bg-sky-50 text-blue-400" />
          <MacroBadge label="C" value={`${meal.carbs}g`} color="bg-amber-50 text-amber-600" />
          <MacroBadge label="F" value={`${meal.fat}g`} color="bg-purple-50 text-purple-400" />
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
        <span className="text-xs text-gray-400">${meal.cost.toFixed(2)}</span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {showRatings && onRate && (
            <>
              <button
                onClick={() => onRate("like")}
                aria-label="Like this meal"
                title="Like — we'll save it as a favorite"
                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                  rating === "like"
                    ? "bg-emerald-500/25 text-emerald-700"
                    : "bg-white text-gray-400 hover:text-emerald-600 hover:bg-gray-100"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M8.834.066c.763.087 1.5.295 2.01.884.505.581.656 1.378.656 2.3 0 .467-.087 1.119-.157 1.637L11.328 5h1.422c.603 0 1.174.085 1.668.333.508.254.911.679 1.137 1.2.453.998.438 2.447.188 4.316l-.04.306c-.105.79-.195 1.473-.313 2.033-.131.63-.315 1.209-.668 1.672C13.97 15.847 12.706 16 11 16c-1.848 0-3.234-.333-4.388-.653-.165-.045-.323-.09-.475-.133-.658-.186-1.2-.34-1.725-.415A1.75 1.75 0 0 1 2.75 16h-1A1.75 1.75 0 0 1 0 14.25v-7.5C0 5.784.784 5 1.75 5h1a1.75 1.75 0 0 1 1.514.872c.258-.105.59-.268.918-.508C5.853 4.874 6.5 4.079 6.5 2.75v-.5c0-1.202.994-2.337 2.334-2.184Z" />
                </svg>
              </button>
              <button
                onClick={() => onRate("dislike")}
                aria-label="Dislike this meal"
                title="Dislike — we won't show it again"
                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                  rating === "dislike"
                    ? "bg-red-500/25 text-red-700"
                    : "bg-white text-gray-400 hover:text-red-600 hover:bg-gray-100"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 rotate-180">
                  <path d="M8.834.066c.763.087 1.5.295 2.01.884.505.581.656 1.378.656 2.3 0 .467-.087 1.119-.157 1.637L11.328 5h1.422c.603 0 1.174.085 1.668.333.508.254.911.679 1.137 1.2.453.998.438 2.447.188 4.316l-.04.306c-.105.79-.195 1.473-.313 2.033-.131.63-.315 1.209-.668 1.672C13.97 15.847 12.706 16 11 16c-1.848 0-3.234-.333-4.388-.653-.165-.045-.323-.09-.475-.133-.658-.186-1.2-.34-1.725-.415A1.75 1.75 0 0 1 2.75 16h-1A1.75 1.75 0 0 1 0 14.25v-7.5C0 5.784.784 5 1.75 5h1a1.75 1.75 0 0 1 1.514.872c.258-.105.59-.268.918-.508C5.853 4.874 6.5 4.079 6.5 2.75v-.5c0-1.202.994-2.337 2.334-2.184Z" />
                </svg>
              </button>
            </>
          )}
          {onSwap && (
            <button
              onClick={onSwap}
              aria-label="Swap this meal"
              title="Swap for a different meal"
              className="w-6 h-6 rounded-md bg-white text-gray-400 hover:text-brand-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M13.78 10.47a.75.75 0 0 1 0 1.06l-2.25 2.25a.75.75 0 1 1-1.06-1.06l.97-.97H5.75a.75.75 0 0 1 0-1.5h5.69l-.97-.97a.75.75 0 1 1 1.06-1.06l2.25 2.25ZM2.22 5.53a.75.75 0 0 1 0-1.06l2.25-2.25a.75.75 0 0 1 1.06 1.06l-.97.97h5.69a.75.75 0 0 1 0 1.5H4.56l.97.97a.75.75 0 1 1-1.06 1.06L2.22 5.53Z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Meal Prep Guide ─────────────────────────────────────────────────────────
// The week's two prep sessions: what to batch-cook on Sunday and Wednesday,
// how many servings each recipe makes, which days it covers, and how to store
// and reheat the portions. Fresh meals stay on their day cards below.

function PrepRecipeRow({ recipe, onClick }: { recipe: PrepRecipe; onClick: () => void }) {
  const m = recipe.meal;
  return (
    <div className="py-3 border-b border-brand-900/10 last:border-0">
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
        className="flex items-start gap-3 cursor-pointer group"
      >
        <span className="text-base w-6 flex-shrink-0 text-center mt-0.5">{MEAL_ICONS[m.type]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider leading-none mb-0.5">
            {MEAL_LABELS[m.type]}
          </p>
          <p className="text-sm text-gray-900 font-medium leading-snug group-hover:text-brand-700 transition-colors">
            {m.name}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Cook {recipe.servingsToCook} serving{recipe.servingsToCook === 1 ? "" : "s"} · covers{" "}
            {recipe.coveredDays.join(", ")}
            {recipe.batchServings > recipe.servingsToCook &&
              ` · recipe scales to ${recipe.batchServings}`}
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            <MacroBadge label="kcal" value={m.calories} color="bg-gray-50 text-gray-600" />
            <MacroBadge label="P" value={`${m.protein}g`} color="bg-sky-50 text-blue-400" />
            <span className="text-[10px] text-gray-400 ml-1">per serving</span>
          </div>
        </div>
      </div>
      <div className="mt-2 ml-9 space-y-1.5">
        <div className="flex gap-2 text-xs">
          <span className="flex-shrink-0">🧊</span>
          <p className="text-gray-500 leading-relaxed">{recipe.storageInstructions}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="flex-shrink-0">♨️</span>
          <p className="text-gray-500 leading-relaxed">{recipe.reheatInstructions}</p>
        </div>
        <details className="text-xs">
          <summary className="text-gray-500 hover:text-gray-700 cursor-pointer select-none">
            Batch ingredients ({recipe.batchIngredients.length})
          </summary>
          <ul className="mt-1.5 space-y-1 pl-1">
            {recipe.batchIngredients.map((ing, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="w-1 h-1 rounded-full bg-brand-500/60 flex-shrink-0 mt-1" />
                <span className="text-gray-600 flex-1">{ing.item}</span>
                <span className="text-gray-400 flex-shrink-0">{ing.amount}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}

function PrepGuide({ sessions, onMealClick }: { sessions: PrepSession[]; onMealClick: (m: Meal) => void }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🍳</span>
        <div>
          <h2 className="text-gray-900 font-bold text-lg leading-tight">Meal Prep Guide</h2>
          <p className="text-xs text-gray-500">
            Two batch-cooking sessions cover most of this week — everything else is made fresh.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sessions.map((session) => (
          <div
            key={session.sessionDay}
            className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-3 bg-brand-50/50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  {session.sessionDay === "Sunday" ? "🟣" : "🔵"} {session.title}
                </p>
                <p className="text-xs text-gray-400">{session.coversLabel}</p>
              </div>
              <span className="text-xs text-gray-500">
                {session.recipes.length} recipe{session.recipes.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="px-4">
              {session.recipes.map((r) => (
                <PrepRecipeRow key={`${r.slot}-${r.meal.id}`} recipe={r} onClick={() => onMealClick(r.meal)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Day Card ────────────────────────────────────────────────────────────────

const DAY_SLOTS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function DayCard({
  dayPlan,
  onMealClick,
  onSwap,
  ratings,
  onRate,
  showRatings,
}: {
  dayPlan: DayMeals;
  onMealClick: (m: Meal) => void;
  onSwap?: (dayIndex: number, slot: MealType, current: Meal) => void;
  ratings?: Record<string, Rating>;
  onRate?: (mealId: string, kind: Rating) => void;
  showRatings?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden transition-colors hover:border-brand-300">
      <div className="relative px-5 py-3 bg-gradient-to-r from-brand-500/[0.07] to-transparent border-b border-gray-200 flex items-center justify-between">
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-brand-400 to-emerald-600" aria-hidden="true" />
        <div>
          <p className="font-semibold text-gray-900 text-sm">{dayPlan.day}</p>
          <p className="text-xs text-gray-400">{dayPlan.date}</p>
        </div>
        <span className="text-xs font-medium text-emerald-700/80 bg-emerald-50 border border-emerald-300 rounded-full px-2 py-0.5">
          ${dayPlan.dailyCost.toFixed(2)}
        </span>
      </div>
      <div className="px-4">
        {DAY_SLOTS.map((slot) => {
          const meal = dayPlan[slot];
          return (
            <MealCard
              key={slot}
              meal={meal}
              onClick={() => onMealClick(meal)}
              onSwap={onSwap ? () => onSwap(dayPlan.dayIndex, slot, meal) : undefined}
              rating={ratings?.[meal.id]}
              onRate={onRate ? (kind) => onRate(meal.id, kind) : undefined}
              showRatings={showRatings}
              source={dayPlan.slotSources?.[slot]}
            />
          );
        })}
      </div>
      <div className="px-5 py-2.5 bg-brand-50/40 border-t border-gray-200 flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-gray-400 mr-0.5 font-medium">Daily:</span>
        <MacroBadge label="kcal" value={dayPlan.dailyCalories.toLocaleString()} color="bg-gray-50 text-gray-700" />
        <MacroBadge label="P" value={`${dayPlan.dailyProtein}g`} color="bg-sky-50 text-sky-700" />
        <MacroBadge label="C" value={`${dayPlan.dailyCarbs}g`} color="bg-amber-50 text-amber-700" />
        <MacroBadge label="F" value={`${dayPlan.dailyFat}g`} color="bg-purple-50 text-purple-700" />
      </div>
    </div>
  );
}

// ─── Swap Modal ──────────────────────────────────────────────────────────────

function SwapModal({
  current,
  alternatives,
  loading,
  onSelect,
  onClose,
}: {
  current: Meal;
  alternatives: Meal[];
  loading: boolean;
  onSelect: (mealId: string) => void;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="w-full sm:max-w-xl max-h-[92dvh] sm:max-h-[80vh] bg-white border border-gray-200 rounded-t-3xl sm:rounded-2xl overflow-y-auto shadow-2xl shadow-brand-900/15 flex flex-col">
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{MEAL_ICONS[current.type]}</span>
              <span className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                Swap {MEAL_LABELS[current.type]}
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">
              Replace &ldquo;{current.name}&rdquo;
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Alternatives below use only ingredients already on your grocery list.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-50 hover:bg-brand-100 flex items-center justify-center transition-colors mt-1"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-600">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-4 py-3">
          {alternatives.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10 px-6">
              No other {MEAL_LABELS[current.type].toLowerCase()} recipes can be cooked from your
              current grocery list. Try a higher budget for more variety.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {alternatives.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => onSelect(m.id)}
                    disabled={loading}
                    className="w-full text-left flex items-center gap-3 py-3 px-2 hover:bg-white rounded-lg transition-colors disabled:opacity-50 group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 font-medium leading-snug group-hover:text-brand-700 transition-colors">
                        {m.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <MacroBadge label="kcal" value={m.calories} color="bg-gray-50 text-gray-600" />
                        <MacroBadge label="P" value={`${m.protein}g`} color="bg-sky-50 text-blue-400" />
                        <MacroBadge label="C" value={`${m.carbs}g`} color="bg-amber-50 text-amber-600" />
                        <MacroBadge label="F" value={`${m.fat}g`} color="bg-purple-50 text-purple-400" />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">${m.cost.toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {loading && (
          <div className="sticky bottom-0 bg-white/95 border-t border-gray-200 px-6 py-3 flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Swapping meal and updating your grocery list…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upgrade Overlay ─────────────────────────────────────────────────────────

function UpgradeOverlay({ onUpgrade, loading }: { onUpgrade: (tierId: string) => void; loading: boolean }) {
  const paidTiers = planTiers.filter((t) => t.priceInCents > 0);
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
      style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(252,253,252,0.8) 25%, rgba(252,253,252,0.98) 55%)" }}
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center shadow-sm">
          <span className="sr-only">Locked</span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-700">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <p className="text-gray-900 font-bold text-lg">Unlock your full plan</p>
          <p className="text-gray-600 text-sm mt-1 max-w-xs">
            Get your complete multi-week plan, all recipes, meal swaps, and ratings.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          {paidTiers.map((t) => (
            <button
              key={t.id}
              onClick={() => onUpgrade(t.id)}
              disabled={loading}
              className={`flex-1 rounded-xl px-5 py-4 border text-left transition-all disabled:opacity-60 ${
                t.badge === "Best Value"
                  ? "bg-brand-50 border-brand-400 hover:border-brand-500 shadow-md shadow-brand-700/10"
                  : "bg-white border-gray-200 hover:border-gray-300 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                {t.badge && (
                  <span className="text-[10px] bg-brand-100 text-brand-700 border border-brand-300 rounded-full px-1.5 py-0.5 leading-none">
                    {t.badge}
                  </span>
                )}
              </div>
              <p className="text-2xl font-extrabold text-gray-900 mt-1">
                ${t.price}
                <span className="text-xs font-medium text-gray-500">
                  /{t.id === "annual" ? "year" : "month"}
                </span>
              </p>
              {t.id === "annual" && (
                <p className="text-[11px] text-brand-700 mt-0.5">
                  ${(t.price / 12).toFixed(2)}/mo equivalent
                </p>
              )}
            </button>
          ))}
        </div>
        {loading && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Redirecting to checkout…
          </p>
        )}
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Secure payment via Stripe
        </p>
      </div>
    </div>
  );
}

// ─── Main Plan Content ────────────────────────────────────────────────────────

function PlanContent() {
  const router = useRouter();
  const posthog = usePostHog();
  const params = useSearchParams();

  const budget = parseFloat(params.get("budget") || "50");
  const numberOfPeople = parseInt(params.get("people") || "1");
  const goal = params.get("goal") || "";
  const dietsParam = params.get("diets") || "";
  const selectedDiets = dietsParam ? dietsParam.split(",").filter(Boolean) : [];
  const tierParam = params.get("tier") || "free";
  const paidParam = params.get("paid") === "true";
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
  const saltParam = params.get("salt") || "";

  const tier = getTierById(tierParam);
  const isFree = tier.id === "free";

  const allergiesList = allergiesParam
    ? allergiesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // One salt per generated plan. Read from the URL when present (so the plan
  // and grocery pages render the exact same generation); otherwise pick one
  // and thread it through every link/redirect this page builds. For users
  // with a saved meal_plans row (paid or free trial) the saved salt overrides
  // this so they get the exact same plan back on every visit.
  const [planSalt, setPlanSalt] = useState(() =>
    saltParam ? parseInt(saltParam, 10) : Math.floor(Math.random() * 0x7fffffff)
  );

  // Calculate TDEE/calorie target if body metrics are present. The surplus or
  // deficit comes from the target weight + timeframe when given.
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

  const [resolving, setResolving] = useState(true);
  const [unlocked, setUnlocked] = useState(isFree);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [genError, setGenError] = useState(false);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [swapTarget, setSwapTarget] = useState<{ dayIndex: number; slot: MealType; current: Meal } | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);

  // Resolve the saved meal_plans row: anyone with a saved row (paid or free
  // trial) reuses its plan_salt so every return visit regenerates the exact
  // same plan; if the row has no salt yet (fresh paid plan or a just-created
  // trial row) this generation's salt is persisted. Free users also get
  // redirected to their saved params if the URL doesn't match. Ratings
  // initialize from the saved row.
  useEffect(() => {
    fetch("/api/meal-plans/saved")
      .then((r) => r.json())
      .then(async ({ plan }) => {
        // Bare visit from the nav bar (no query params): rebuild the URL from
        // the saved row so the same generation (same salt) renders. This is
        // the returning-user restoration that used to live on the old home
        // page. New users with no saved row go fill out the form instead.
        if (!params.get("budget")) {
          if (!plan) {
            // No saved plan: subscribed users go fill out the form; everyone
            // else gets the same routing the AppShell gate would apply.
            const dest = await resolvePostAuthDestination();
            router.replace(dest === "/plan" ? "/onboarding" : dest);
            return;
          }
          // Prefer the live subscription tier over the saved row's tier so an
          // upgraded user gets their full plan length.
          const sub = await fetch("/api/subscriptions/status")
            .then((r) => r.json())
            .catch(() => ({}));
          const tierOverride = sub?.tier ? getTierById(sub.tier).id : undefined;
          const restored = buildSavedPlanParams(plan, tierOverride);
          if (plan.plan_salt != null) restored.set("salt", String(plan.plan_salt));
          if (paidParam) restored.set("paid", "true");
          window.location.replace(`/plan?${restored.toString()}`);
          return;
        }

        if (plan) {
          const initial: Record<string, Rating> = {};
          for (const id of plan.liked_meal_ids ?? []) initial[id] = "like";
          for (const id of plan.disliked_meal_ids ?? []) initial[id] = "dislike";
          setRatings(initial);
        }

        const savedSalt: number | null = plan?.plan_salt ?? null;
        if (savedSalt != null) {
          setPlanSalt(savedSalt);
        } else if (plan || !isFree) {
          fetch("/api/meal-plans/salt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              salt: planSalt,
              budget: String(budget),
              goal,
              diets: selectedDiets,
              tier: tierParam,
              targetWeight: targetWeightParam || null,
              goalTimeframe: goalTimeframeParam || null,
            }),
          })
            .catch(() => {});
        }
        // plan == null on a free tier: either no saved row exists yet or the
        // /saved fetch errored — salt is intentionally not persisted there.

        if (!isFree || !plan) {
          setResolving(false);
          return;
        }
        const savedDiets: string[] = plan.diets ?? (plan.diet ? [plan.diet] : []);
        const saved = new URLSearchParams({
          budget: String(plan.budget),
          goal: plan.goal ?? "",
          tier: plan.tier ?? "free",
        });
        // Keep in sync with buildSavedPlanParams — param order matters for the
        // string-equality mismatch check below.
        if (plan.number_of_people) saved.set("people", String(plan.number_of_people));
        if (savedDiets.length > 0) saved.set("diets", savedDiets.join(","));
        if (plan.age) saved.set("age", String(plan.age));
        if (plan.activity_level) saved.set("activityLevel", String(plan.activity_level));
        if (plan.allergies) saved.set("allergies", plan.allergies);
        if (plan.weight_lbs) saved.set("weight", String(plan.weight_lbs));
        if (plan.height_ft != null) saved.set("heightFt", String(plan.height_ft));
        if (plan.height_in != null) saved.set("heightIn", String(plan.height_in));
        if (plan.gender) saved.set("gender", plan.gender);
        if (plan.state) saved.set("state", plan.state);
        if (plan.target_weight) saved.set("targetWeight", String(plan.target_weight));
        if (plan.goal_timeframe_weeks) saved.set("goalTimeframe", String(plan.goal_timeframe_weeks));

        const current = new URLSearchParams({
          budget: String(budget),
          goal, tier: tierParam,
        });
        if (params.get("people")) current.set("people", params.get("people")!);
        if (dietsParam) current.set("diets", dietsParam);
        if (ageParam) current.set("age", ageParam);
        if (activityLevelParam) current.set("activityLevel", activityLevelParam);
        if (allergiesParam) current.set("allergies", allergiesParam);
        if (weightParam) current.set("weight", weightParam);
        if (heightFtParam) current.set("heightFt", heightFtParam);
        if (heightInParam) current.set("heightIn", heightInParam);
        if (genderParam) current.set("gender", genderParam);
        if (stateParam) current.set("state", stateParam);
        if (targetWeightParam) current.set("targetWeight", targetWeightParam);
        if (goalTimeframeParam) current.set("goalTimeframe", goalTimeframeParam);

        if (saved.toString() !== current.toString()) {
          saved.set("salt", String(savedSalt ?? planSalt));
          // Hard navigation: a soft replace keeps this component mounted, so
          // this mount-only effect would never re-run and the page would be
          // stuck on the resolving spinner with stale params.
          window.location.replace(`/plan?${saved.toString()}`);
        } else {
          setResolving(false);
        }
      })
      .catch(() => setResolving(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check the subscriptions table on every load; when returning from Stripe
  // (?paid=true) poll for up to 12 s to give the webhook time to land.
  useEffect(() => {
    if (isFree) return;

    let active = true;
    let attempt = 0;
    const maxAttempts = paidParam ? 8 : 1;

    function buildCleanUrl() {
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
      p.set("salt", String(planSalt));
      return p.toString();
    }

    async function check() {
      try {
        const res = await fetch("/api/subscriptions/status");
        const { unlocked: ok } = await res.json();
        if (!active) return;
        if (ok) {
          setUnlocked(true);
          if (paidParam) router.replace(`/plan?${buildCleanUrl()}`);
          return;
        }
      } catch {}

      attempt++;
      if (active && attempt < maxAttempts) {
        setTimeout(check, 1500);
      } else if (paidParam && active) {
        // Webhook didn't land in time — strip the param, leave paywall visible.
        router.replace(`/plan?${buildCleanUrl()}`);
      }
    }

    check();
    return () => { active = false; };
  }, [isFree, paidParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (resolving) return;
    let cancelled = false;
    setGenError(false);
    fetch("/api/generate-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budget,
        numberOfPeople,
        goal,
        diets: selectedDiets,
        allergies: allergiesList,
        totalDays: tier.days,
        stateCode: stateParam,
        calorieTarget,
        weightLbs: weightParam ? parseFloat(weightParam) : undefined,
        planSalt,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`generate-plan ${r.status}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setPlan(data); })
      .catch((e: Error) => {
        if (cancelled) return;
        setGenError(true);
        posthog.capture("plan_generation_failed", {
          page: "plan", budget, tier: tierParam, error: e?.message ?? "unknown",
        });
      });
    return () => { cancelled = true; };
  }, [resolving, planSalt]); // eslint-disable-line react-hooks/exhaustive-deps

  const isWeekLocked = !unlocked && currentWeek > 0;

  const handleMealClick = useCallback((meal: Meal) => {
    setSelectedMeal(meal);
  }, []);

  useEffect(() => {
    if (isWeekLocked) {
      posthog.capture("paywall_hit", { tier: tierParam, budget, goal, diets: selectedDiets });
    }
  }, [isWeekLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  if (genError) {
    return (
      <div className="flex-1 min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center bg-white border border-gray-200 rounded-2xl p-8">
          <p className="text-gray-900 font-semibold mb-2">We couldn&apos;t build your plan</p>
          <p className="text-sm text-gray-600 mb-5">
            Something went wrong generating your meal plan. Your preferences are safe — try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (resolving || !plan) {
    return (
      <div className="flex-1 min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600 text-sm">
          <svg className="w-4 h-4 animate-spin text-brand-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Building your plan…
        </div>
      </div>
    );
  }
  const numWeeks = plan.weeks.length;
  const weekDays = plan.weeks[currentWeek] ?? [];

  const budgetDiff = +(budget - plan.weeklyEstimatedCost).toFixed(2);
  const underBudget = budgetDiff >= 0;

  function buildGroceryParams() {
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
    p.set("salt", String(planSalt));
    return p;
  }

  async function handleUpgrade(tierId: string) {
    setCheckoutLoading(true);
    posthog.capture("checkout_started", { tier: tierId, budget, source: "paywall" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: String(budget),
          people: String(numberOfPeople),
          goal,
          diets: selectedDiets,
          tier: tierId,
          age: ageParam,
          activityLevel: activityLevelParam,
          allergies: allergiesParam,
          weight: weightParam,
          heightFt: heightFtParam,
          heightIn: heightInParam,
          gender: genderParam,
          state: stateParam,
          targetWeight: targetWeightParam,
          goalTimeframe: goalTimeframeParam,
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {}
    setCheckoutLoading(false);
  }

  function handleRate(mealId: string, kind: Rating) {
    // Optimistic toggle; both endpoints toggle server-side and keep
    // liked/disliked mutually exclusive. On failure the optimistic state is
    // rolled back so the UI never disagrees with the database.
    const before = ratings;
    setRatings((prev) => {
      const next = { ...prev };
      if (prev[mealId] === kind) delete next[mealId];
      else next[mealId] = kind;
      return next;
    });
    fetch(kind === "like" ? "/api/meals/like" : "/api/meals/dislike", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealId }),
    })
      .then((r) => {
        if (!r.ok) setRatings(before);
      })
      .catch(() => setRatings(before));
  }

  function handleSwapSelect(newMealId: string) {
    if (!swapTarget) return;
    setSwapLoading(true);
    fetch("/api/meals/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayIndex: swapTarget.dayIndex,
        slot: swapTarget.slot,
        newMealId,
        planSalt,
        budget,
        numberOfPeople,
        goal,
        diets: selectedDiets,
        allergies: allergiesList,
        totalDays: tier.days,
        stateCode: stateParam,
        calorieTarget,
        weightLbs: weightParam ? parseFloat(weightParam) : undefined,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        // The route returns the swapped day plus the full regenerated plan
        // (the swap repeats on the matching weekday of every week, and the
        // grocery cart may have changed) — replace the whole plan state.
        if (data.plan) setPlan(data.plan);
      })
      .catch(() => {})
      .finally(() => {
        setSwapLoading(false);
        setSwapTarget(null);
      });
  }

  const swapAlternatives = swapTarget && plan
    ? findSwapAlternatives(
        (plan.weeklyCarts[currentWeek] ?? plan.weeklyCarts[0]).items.map((i) => i.key),
        swapTarget.slot,
        (plan.weeks[currentWeek] ?? []).flatMap((d) => [d.breakfast.id, d.lunch.id, d.dinner.id, d.snack.id]),
        selectedDiets,
        allergiesList,
        Object.entries(ratings).filter(([, v]) => v === "dislike").map(([id]) => id)
      )
    : [];

  return (
    <>
      {selectedMeal && (
        <RecipeModal meal={selectedMeal} onClose={() => setSelectedMeal(null)} />
      )}
      {swapTarget && (
        <SwapModal
          current={swapTarget.current}
          alternatives={swapAlternatives}
          loading={swapLoading}
          onSelect={handleSwapSelect}
          onClose={() => { if (!swapLoading) setSwapTarget(null); }}
        />
      )}

      <main className="flex-1 flex flex-col">
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">
              Your {tier.days}-Day{" "}
              <span className="bg-gradient-to-r from-brand-700 to-emerald-600 bg-clip-text text-transparent">
                Meal Plan
              </span>
            </h1>
            <p className="text-sm text-gray-500 mb-3">
              Tap any meal to see the full recipe and USDA macro data
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-full px-3 py-1">
                ${budget}/wk budget
              </span>
              <span className="text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-full px-3 py-1">
                {tier.label} Plan
              </span>
              {targetWeightParam && goalTimeframeParam ? (
                <span className="text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-full px-3 py-1">
                  Target: {targetWeightParam} lbs in {goalTimeframeParam} wks
                </span>
              ) : goal ? (
                <span className="text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-full px-3 py-1">
                  {GOAL_LABELS[goal]}
                </span>
              ) : null}
              {selectedDiets.length > 0 ? (
                selectedDiets.map((d) => (
                  <span key={d} className="text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-full px-3 py-1">
                    {DIET_LABELS[d] ?? d}
                  </span>
                ))
              ) : (
                <span className="text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-full px-3 py-1">
                  No restrictions
                </span>
              )}
              {stateParam && STATE_NAMES[stateParam] && (
                <span className="text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-full px-3 py-1">
                  {STATE_NAMES[stateParam]}
                </span>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <div className={`grid grid-cols-1 gap-4 mb-8 ${calorieTarget ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <div className="bg-gradient-to-b from-emerald-500/10 to-transparent border border-emerald-300 rounded-2xl px-5 py-4">
              <p className="text-xs text-emerald-700/70 uppercase tracking-wider font-medium mb-1">🛒 Est. weekly cost</p>
              <p className={`text-2xl font-bold ${underBudget ? "text-brand-700" : "text-red-600"}`}>
                ${plan.weeklyEstimatedCost.toFixed(2)}
              </p>
              <p className="text-xs mt-1 text-gray-500">
                {underBudget
                  ? `$${budgetDiff.toFixed(2)} under budget`
                  : `$${Math.abs(budgetDiff).toFixed(2)} over budget`}
              </p>
              {plan.numWeeks > 1 && (
                <p className="text-xs mt-1 text-gray-400">
                  ${plan.totalPlanCost.toFixed(2)} total · {plan.numWeeks} weeks
                </p>
              )}
            </div>
            <div className="bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-300 rounded-2xl px-5 py-4">
              <p className="text-xs text-amber-700/70 uppercase tracking-wider font-medium mb-1">🔥 Avg. daily calories</p>
              <p className="text-2xl font-bold text-amber-800">{plan.avgDailyCalories.toLocaleString()}</p>
              <p className="text-xs mt-1 text-gray-500">kcal per day</p>
            </div>
            <div className="bg-gradient-to-b from-sky-500/10 to-transparent border border-sky-300 rounded-2xl px-5 py-4">
              <p className="text-xs text-sky-700/70 uppercase tracking-wider font-medium mb-1">💪 Avg. daily protein</p>
              <p className="text-2xl font-bold text-sky-700">{plan.avgDailyProtein}g</p>
              <p className="text-xs mt-1 text-gray-500">protein per day</p>
            </div>
            {calorieTarget && (
              <div className="bg-gradient-to-b from-brand-500/15 to-transparent border border-brand-300 rounded-2xl px-5 py-4">
                <p className="text-xs text-brand-700/80 uppercase tracking-wider font-medium mb-1">🎯 Calorie target</p>
                <p className="text-2xl font-bold text-brand-700">{calorieTarget.toLocaleString()}</p>
                <p className="text-xs mt-1 text-brand-700/60">
                  TDEE {tdee?.toLocaleString()} · {goal ? GOAL_LABELS[goal] : "Maintenance"}
                </p>
              </div>
            )}
          </div>

          {/* Budget cap warning */}
          {plan.budgetCapMessage && (
            <div className="mb-6 bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4 flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-amber-700">{plan.budgetCapMessage}</p>
            </div>
          )}

          {/* Week navigation */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentWeek((w) => Math.max(0, w - 1))}
                disabled={currentWeek === 0}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:border-brand-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="text-center">
                <p className="text-gray-900 font-semibold text-sm">Week {currentWeek + 1}</p>
                <p className="text-xs text-gray-400">of {numWeeks}</p>
              </div>
              <button
                onClick={() => setCurrentWeek((w) => Math.min(numWeeks - 1, w + 1))}
                disabled={currentWeek === numWeeks - 1 || (!unlocked && currentWeek === 0)}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:border-brand-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {numWeeks > 1 && numWeeks <= 8 && (
              <div className="hidden sm:flex items-center gap-1.5">
                {Array.from({ length: numWeeks }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (!unlocked && i > 0) return;
                      setCurrentWeek(i);
                    }}
                    className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                      currentWeek === i
                        ? "bg-gradient-to-br from-brand-500 to-emerald-600 text-white shadow-md shadow-brand-500/30"
                        : !unlocked && i > 0
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-gray-50 text-gray-600 hover:bg-brand-100 hover:text-gray-900"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Meal prep guide for the visible week */}
          {!isWeekLocked && (plan.prepSessions?.[currentWeek]?.length ?? 0) > 0 && (
            <PrepGuide sessions={plan.prepSessions[currentWeek]} onMealClick={handleMealClick} />
          )}

          {/* Day cards */}
          {!isWeekLocked && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📅</span>
              <div>
                <h2 className="text-gray-900 font-bold text-lg leading-tight">Day by Day</h2>
                <p className="text-xs text-gray-500">
                  Reheat-tagged meals come out of your prep containers; everything else is made fresh that day.
                </p>
              </div>
            </div>
          )}
          {isWeekLocked ? (
            <div className="relative min-h-[500px]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 blur-sm pointer-events-none select-none" aria-hidden>
                {(plan.weeks[1] ?? plan.weeks[0]).map((dayPlan) => (
                  <DayCard key={dayPlan.dayIndex} dayPlan={dayPlan} onMealClick={() => {}} />
                ))}
              </div>
              <UpgradeOverlay onUpgrade={handleUpgrade} loading={checkoutLoading} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {weekDays.map((dayPlan) => (
                <DayCard
                  key={dayPlan.dayIndex}
                  dayPlan={dayPlan}
                  onMealClick={handleMealClick}
                  onSwap={(dayIndex, slot, current) => setSwapTarget({ dayIndex, slot, current })}
                  ratings={ratings}
                  onRate={!isFree && unlocked ? handleRate : undefined}
                  showRatings={!isFree && unlocked}
                />
              ))}
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <button
              onClick={() => router.push(`/grocery?${buildGroceryParams().toString()}`)}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.628a1.75 1.75 0 0 1 1.734 1.51L5.18 3a65.25 65.25 0 0 1 13.36 1.412.75.75 0 0 1 .58.875 48.645 48.645 0 0 1-1.618 6.2.75.75 0 0 1-.712.513H6a2.503 2.503 0 0 0-2.292 1.5H17.25a.75.75 0 0 1 0 1.5H2.76a.75.75 0 0 1-.748-.807 4.002 4.002 0 0 1 2.716-3.486L3.626 4.51A.25.25 0 0 0 3.379 4H1.75A.75.75 0 0 1 1 3.25V1.75ZM6 15.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM15.5 17a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
              </svg>
              View Grocery List
            </button>
            <p className="text-sm text-gray-500">Not happy with your plan?</p>
            <button
              onClick={() => router.push("/settings")}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-brand-500/20"
            >
              Adjust preferences &amp; regenerate
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-600 text-sm">Building your plan…</div>
      </div>
    }>
      <PlanContent />
    </Suspense>
  );
}
