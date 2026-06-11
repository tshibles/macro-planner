"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePostHog } from "posthog-js/react";
import type { DayMeals, MealPlan } from "@/app/lib/generatePlan";
import { Meal } from "@/app/data/meals";
import { getTierById } from "@/app/data/plans";
import { UserButton } from "@/app/components/UserButton";
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
      <div className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[85vh] bg-gray-900 border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-y-auto shadow-2xl flex flex-col">
        {/* Modal header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-white/8 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{MEAL_ICONS[meal.type]}</span>
              <span className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                {MEAL_LABELS[meal.type]}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white leading-tight">{meal.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors mt-1"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Macro breakdown */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Macro Breakdown
              </h3>
              {meal.portionMultiplier && meal.portionMultiplier !== 1 ? (
                <span className="text-xs text-amber-400/70">
                  ×{meal.portionMultiplier.toFixed(2)} portions
                </span>
              ) : usdaLoading ? (
                <span className="text-xs text-gray-600 flex items-center gap-1.5">
                  <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Fetching USDA data…
                </span>
              ) : usdaMacros ? (
                <span className="text-xs text-emerald-500/70">USDA FoodData Central</span>
              ) : (
                <span className="text-xs text-gray-600">Estimated</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Calories", value: displayMacros.calories, unit: "kcal", color: "bg-white/5 border-white/10", text: "text-white" },
                { label: "Protein", value: displayMacros.protein, unit: "g", color: "bg-blue-500/10 border-blue-500/20", text: "text-blue-300" },
                { label: "Carbs", value: displayMacros.carbs, unit: "g", color: "bg-amber-500/10 border-amber-500/20", text: "text-amber-300" },
                { label: "Fat", value: displayMacros.fat, unit: "g", color: "bg-purple-500/10 border-purple-500/20", text: "text-purple-300" },
              ].map(({ label, value, unit, color, text }) => (
                <div key={label} className={`rounded-xl border px-3 py-3 text-center ${color}`}>
                  <p className={`text-lg font-bold ${text}`}>{value}</p>
                  <p className="text-xs text-gray-500">{unit}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {usdaMacros?.source && (
              <p className="mt-2 text-xs text-gray-600 truncate">
                Matched: &ldquo;{usdaMacros.source}&rdquo;
              </p>
            )}
          </div>

          {/* Ingredients */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Ingredients
            </h3>
            <ul className="space-y-1.5">
              {meal.ingredients.map((ing, i) => (
                <li key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500/60 flex-shrink-0 mt-1.5" />
                  <span className="text-gray-300 flex-1">{ing.item}</span>
                  <span className="text-gray-500 text-xs flex-shrink-0">{ing.amount}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Instructions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Instructions
            </h3>
            <ol className="space-y-3">
              {meal.instructions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-400 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-gray-300 leading-relaxed flex-1">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Cost */}
          <div className="pt-2 pb-1 border-t border-white/8 flex items-center justify-between text-sm">
            <span className="text-gray-500">Estimated cost per serving</span>
            <span className="text-gray-300 font-semibold">${meal.cost.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Meal Card ───────────────────────────────────────────────────────────────

function MealCard({ meal, onClick }: { meal: Meal; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 py-3 px-0 border-b border-white/5 last:border-0 hover:bg-white/[0.02] -mx-1 px-1 rounded-lg transition-colors group"
    >
      <span className="text-base w-6 flex-shrink-0 text-center">{MEAL_ICONS[meal.type]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-600 font-medium uppercase tracking-wider leading-none mb-0.5">
          {MEAL_LABELS[meal.type]}
        </p>
        <p className="text-sm text-white font-medium leading-snug group-hover:text-brand-400 transition-colors truncate">
          {meal.name}
        </p>
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          <MacroBadge label="kcal" value={meal.calories} color="bg-white/6 text-gray-400" />
          <MacroBadge label="P" value={`${meal.protein}g`} color="bg-blue-500/10 text-blue-400" />
          <MacroBadge label="C" value={`${meal.carbs}g`} color="bg-amber-500/10 text-amber-400" />
          <MacroBadge label="F" value={`${meal.fat}g`} color="bg-purple-500/10 text-purple-400" />
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span className="text-xs text-gray-600">${meal.cost.toFixed(2)}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-gray-600 group-hover:text-brand-500 transition-colors">
          <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l4.25-4.25a.75.75 0 0 0 0-1.06L7.28 0.22a.75.75 0 0 0-1.06 1.06L9.94 5l-3.72 3.72Z" />
          <path d="M9.94 11l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25h-8a.75.75 0 0 1 0-1.5h8L5.16 4.16a.75.75 0 1 1 1.06-1.06l4.25 4.25c.293.293.44.677.44 1.06L10.91 9.5l-.97.97Z" />
        </svg>
      </div>
    </button>
  );
}

// ─── Day Card ────────────────────────────────────────────────────────────────

function DayCard({ dayPlan, onMealClick }: { dayPlan: DayMeals; onMealClick: (m: Meal) => void }) {
  return (
    <div className="bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 bg-white/[0.03] border-b border-white/8 flex items-center justify-between">
        <div>
          <p className="font-semibold text-white text-sm">{dayPlan.day}</p>
          <p className="text-xs text-gray-600">{dayPlan.date}</p>
        </div>
        <span className="text-xs text-gray-500">${dayPlan.dailyCost.toFixed(2)}</span>
      </div>
      <div className="px-4">
        <MealCard meal={dayPlan.breakfast} onClick={() => onMealClick(dayPlan.breakfast)} />
        <MealCard meal={dayPlan.lunch} onClick={() => onMealClick(dayPlan.lunch)} />
        <MealCard meal={dayPlan.dinner} onClick={() => onMealClick(dayPlan.dinner)} />
        <MealCard meal={dayPlan.snack} onClick={() => onMealClick(dayPlan.snack)} />
      </div>
      <div className="px-5 py-2.5 bg-white/[0.02] border-t border-white/8 flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-gray-600 mr-0.5 font-medium">Daily:</span>
        <MacroBadge label="kcal" value={dayPlan.dailyCalories.toLocaleString()} color="bg-white/6 text-gray-300" />
        <MacroBadge label="P" value={`${dayPlan.dailyProtein}g`} color="bg-blue-500/10 text-blue-300" />
        <MacroBadge label="C" value={`${dayPlan.dailyCarbs}g`} color="bg-amber-500/10 text-amber-300" />
        <MacroBadge label="F" value={`${dayPlan.dailyFat}g`} color="bg-purple-500/10 text-purple-300" />
      </div>
    </div>
  );
}

// ─── Upgrade Overlay ─────────────────────────────────────────────────────────

function UpgradeOverlay({ onUpgrade, loading }: { onUpgrade: () => void; loading: boolean }) {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
      style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(3,7,18,0.75) 25%, rgba(3,7,18,0.97) 55%)" }}
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-white/8 border border-white/12 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <p className="text-white font-bold text-lg">Unlock your full plan</p>
          <p className="text-gray-400 text-sm mt-1 max-w-xs">
            Upgrade to access your complete multi-week plan with all recipes.
          </p>
        </div>
        <button
          onClick={onUpgrade}
          disabled={loading}
          className="mt-1 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 text-white font-semibold px-7 py-3 rounded-xl transition-colors shadow-lg shadow-brand-500/30 flex items-center gap-2 text-sm"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Redirecting…
            </>
          ) : "View Upgrade Options"}
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
  const saltParam = params.get("salt") || "";

  const tier = getTierById(tierParam);
  const isFree = tier.id === "free";

  // One salt per generated plan. Read from the URL when present (so the plan
  // and grocery pages render the exact same generation); otherwise pick one
  // and thread it through every link/redirect this page builds.
  const [planSalt] = useState(() =>
    saltParam ? parseInt(saltParam, 10) : Math.floor(Math.random() * 0x7fffffff)
  );

  // Calculate TDEE/calorie target if body metrics are present
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
  const calorieTarget = tdee ? getCalorieTarget(tdee, goal) : undefined;

  const [resolving, setResolving] = useState(isFree);
  const [unlocked, setUnlocked] = useState(isFree);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [plan, setPlan] = useState<MealPlan | null>(null);

  useEffect(() => {
    if (!isFree) return;
    fetch("/api/meal-plans/saved")
      .then((r) => r.json())
      .then(({ plan }) => {
        if (!plan) {
          setResolving(false);
          return;
        }
        const savedDiets: string[] = plan.diets ?? (plan.diet ? [plan.diet] : []);
        const saved = new URLSearchParams({
          budget: String(plan.budget),
          goal: plan.goal ?? "",
          tier: plan.tier ?? "free",
        });
        if (savedDiets.length > 0) saved.set("diets", savedDiets.join(","));
        if (plan.age) saved.set("age", String(plan.age));
        if (plan.activity_level) saved.set("activityLevel", String(plan.activity_level));
        if (plan.allergies) saved.set("allergies", plan.allergies);
        if (plan.weight_lbs) saved.set("weight", String(plan.weight_lbs));
        if (plan.height_ft != null) saved.set("heightFt", String(plan.height_ft));
        if (plan.height_in != null) saved.set("heightIn", String(plan.height_in));
        if (plan.gender) saved.set("gender", plan.gender);
        if (plan.state) saved.set("state", plan.state);

        const current = new URLSearchParams({
          budget: String(budget),
          goal, tier: tierParam,
        });
        if (dietsParam) current.set("diets", dietsParam);
        if (ageParam) current.set("age", ageParam);
        if (activityLevelParam) current.set("activityLevel", activityLevelParam);
        if (allergiesParam) current.set("allergies", allergiesParam);
        if (weightParam) current.set("weight", weightParam);
        if (heightFtParam) current.set("heightFt", heightFtParam);
        if (heightInParam) current.set("heightIn", heightInParam);
        if (genderParam) current.set("gender", genderParam);
        if (stateParam) current.set("state", stateParam);

        if (saved.toString() !== current.toString()) {
          saved.set("salt", String(planSalt));
          router.replace(`/plan?${saved.toString()}`);
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
      const p = new URLSearchParams({ budget: String(budget), goal, tier: tierParam });
      if (dietsParam) p.set("diets", dietsParam);
      if (ageParam) p.set("age", ageParam);
      if (activityLevelParam) p.set("activityLevel", activityLevelParam);
      if (allergiesParam) p.set("allergies", allergiesParam);
      if (weightParam) p.set("weight", weightParam);
      if (heightFtParam) p.set("heightFt", heightFtParam);
      if (heightInParam) p.set("heightIn", heightInParam);
      if (genderParam) p.set("gender", genderParam);
      if (stateParam) p.set("state", stateParam);
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
      .then((data) => { if (!cancelled) setPlan(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [resolving]); // eslint-disable-line react-hooks/exhaustive-deps

  const isWeekLocked = !unlocked && currentWeek > 0;

  const handleMealClick = useCallback((meal: Meal) => {
    setSelectedMeal(meal);
  }, []);

  useEffect(() => {
    if (isWeekLocked) {
      posthog.capture("paywall_hit", { tier: tierParam, budget, goal, diets: selectedDiets });
    }
  }, [isWeekLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  if (resolving || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Building your plan…</div>
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
    p.set("salt", String(planSalt));
    return p;
  }

  async function handleUpgrade() {
    setCheckoutLoading(true);
    router.push("/");
  }

  return (
    <>
      {selectedMeal && (
        <RecipeModal meal={selectedMeal} onClose={() => setSelectedMeal(null)} />
      )}

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
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors"
            >
              New plan
            </button>
            <UserButton />
          </div>
        </nav>

        <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
              Your {tier.days}-Day{" "}
              <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
                Meal Plan
              </span>
            </h1>
            <p className="text-sm text-gray-500 mb-3">
              Tap any meal to see the full recipe and USDA macro data
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                ${budget}/wk budget
              </span>
              <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                {tier.label} Plan
              </span>
              {goal && (
                <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                  {GOAL_LABELS[goal]}
                </span>
              )}
              {selectedDiets.length > 0 ? (
                selectedDiets.map((d) => (
                  <span key={d} className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                    {DIET_LABELS[d] ?? d}
                  </span>
                ))
              ) : (
                <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                  No restrictions
                </span>
              )}
              {stateParam && STATE_NAMES[stateParam] && (
                <span className="text-xs bg-white/6 border border-white/10 text-gray-300 rounded-full px-3 py-1">
                  {STATE_NAMES[stateParam]}
                </span>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <div className={`grid grid-cols-1 gap-4 mb-8 ${calorieTarget ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <div className="bg-white/[0.04] border border-white/8 rounded-2xl px-5 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Est. weekly cost</p>
              <p className={`text-2xl font-bold ${underBudget ? "text-brand-400" : "text-red-400"}`}>
                ${plan.weeklyEstimatedCost.toFixed(2)}
              </p>
              <p className="text-xs mt-1 text-gray-500">
                {underBudget
                  ? `$${budgetDiff.toFixed(2)} under budget`
                  : `$${Math.abs(budgetDiff).toFixed(2)} over budget`}
              </p>
              {plan.numWeeks > 1 && (
                <p className="text-xs mt-1 text-gray-600">
                  ${plan.totalPlanCost.toFixed(2)} total · {plan.numWeeks} weeks
                </p>
              )}
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
            {calorieTarget && (
              <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl px-5 py-4">
                <p className="text-xs text-brand-400/80 uppercase tracking-wider font-medium mb-1">Calorie target</p>
                <p className="text-2xl font-bold text-brand-300">{calorieTarget.toLocaleString()}</p>
                <p className="text-xs mt-1 text-brand-400/60">
                  TDEE {tdee?.toLocaleString()} · {goal ? GOAL_LABELS[goal] : "Maintenance"}
                </p>
              </div>
            )}
          </div>

          {/* Budget cap warning */}
          {plan.budgetCapMessage && (
            <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-amber-300">{plan.budgetCapMessage}</p>
            </div>
          )}

          {/* Week navigation */}
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
                disabled={currentWeek === numWeeks - 1 || (!unlocked && currentWeek === 0)}
                className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
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
                        ? "bg-brand-500 text-white"
                        : !unlocked && i > 0
                        ? "bg-white/4 text-gray-600 cursor-not-allowed"
                        : "bg-white/6 text-gray-400 hover:bg-white/12 hover:text-white"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Day cards */}
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
                <DayCard key={dayPlan.dayIndex} dayPlan={dayPlan} onMealClick={handleMealClick} />
              ))}
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <button
              onClick={() => router.push(`/grocery?${buildGroceryParams().toString()}`)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.628a1.75 1.75 0 0 1 1.734 1.51L5.18 3a65.25 65.25 0 0 1 13.36 1.412.75.75 0 0 1 .58.875 48.645 48.645 0 0 1-1.618 6.2.75.75 0 0 1-.712.513H6a2.503 2.503 0 0 0-2.292 1.5H17.25a.75.75 0 0 1 0 1.5H2.76a.75.75 0 0 1-.748-.807 4.002 4.002 0 0 1 2.716-3.486L3.626 4.51A.25.25 0 0 0 3.379 4H1.75A.75.75 0 0 1 1 3.25V1.75ZM6 15.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM15.5 17a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
              </svg>
              View Grocery List
            </button>
            <p className="text-sm text-gray-500">Not happy with your plan?</p>
            <button
              onClick={() => router.push("/")}
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-brand-500/20"
            >
              Adjust my preferences
            </button>
          </div>
        </div>

        <footer className="px-6 py-4 text-center text-xs text-gray-600 border-t border-white/5">
          © {new Date().getFullYear()} Macro Planner · Built for college students
        </footer>
      </main>
    </>
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
