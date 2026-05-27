import { meals, Meal, DietaryFlag } from "@/app/data/meals";
import { STATE_MULTIPLIERS } from "@/app/data/stateMultipliers";
import { buildWeeklyCart, PREMIUM_INGREDIENT_CHECKS, CartItem } from "@/app/lib/groceryCart";

export interface DayMeals {
  day: string;
  date: string;
  weekIndex: number;
  dayIndex: number;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  snack: Meal;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  dailyCost: number;
}

export interface WeeklyCartSummary {
  items: CartItem[];
  totalCost: number;
}

export interface MealPlan {
  days: DayMeals[];
  weeks: DayMeals[][];
  totalDays: number;
  numWeeks: number;
  weeklyEstimatedCost: number;
  totalPlanCost: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
  calorieTarget?: number;
  budgetCapMessage?: string;
  weeklyCart: WeeklyCartSummary;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const EXCLUDED_FLAGS: Record<string, DietaryFlag[]> = {
  vegetarian: ["meat", "fish"],
  vegan:      ["meat", "dairy", "fish", "eggs"],
  gluten_free: ["gluten"],
  dairy_free:  ["dairy"],
  halal:       ["pork"],
  kosher:      ["pork"],
};

function isAllowed(meal: Meal, diet: string): boolean {
  const excluded = EXCLUDED_FLAGS[diet] ?? [];
  return !meal.contains.some((f) => excluded.includes(f));
}

function scoreMeal(meal: Meal, goal: string): number {
  const proteinDensity = meal.protein / (meal.calories || 1);
  switch (goal) {
    case "muscle_gain":
      return meal.protein * 3 + proteinDensity * 200;
    case "fat_loss":
      return meal.protein * 3 - meal.calories * 0.3 + proteinDensity * 200;
    case "endurance":
      return meal.carbs * 2 + meal.calories * 0.05;
    case "maintenance":
      return meal.protein * 1.5 + meal.carbs * 0.5 - meal.fat * 0.2;
    case "general_health":
      return meal.protein * 2 - meal.fat * 0.5 + meal.carbs * 0.3;
    default:
      return 0;
  }
}

function formatDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Pool Builder ──────────────────────────────────────────────────────────────

function buildPool(
  type: Meal["type"],
  diet: string,
  goal: string,
  rng: () => number,
  cartKeys: Set<string>,
  dislikedIds: Set<string>,
  slotCalTarget?: number
): Meal[] {
  const eligible = meals.filter((m) => {
    if (m.type !== type) return false;
    if (!isAllowed(m, diet)) return false;
    if (dislikedIds.has(m.id)) return false;
    for (const check of PREMIUM_INGREDIENT_CHECKS) {
      const mealUsesIt = m.ingredients.some((ing) => check.pattern.test(ing.item));
      if (mealUsesIt && !cartKeys.has(check.cartKey)) return false;
    }
    return true;
  });

  // Fallback relaxes premium-ingredient gating but keeps dislike filter.
  const pool =
    eligible.length >= 3
      ? eligible
      : meals.filter(
          (m) => m.type === type && isAllowed(m, diet) && !dislikedIds.has(m.id)
        ).slice(0, 8);

  // Sort by goal score; when a per-slot calorie target is given, weight calorie
  // proximity heavily so high-calorie meals rise to the top of the pool when
  // the user's target demands them.
  const sorted = [...pool].sort((a, b) => {
    const goalDiff = scoreMeal(b, goal) - scoreMeal(a, goal);
    if (slotCalTarget === undefined) return goalDiff;
    const calDiff = Math.abs(a.calories - slotCalTarget) - Math.abs(b.calories - slotCalTarget);
    return calDiff * 3 + goalDiff;
  });
  const topHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
  const bottomHalf = sorted.slice(Math.ceil(sorted.length / 2));
  return [...shuffle(topHalf, rng), ...shuffle(bottomHalf, rng)];
}

// ── Variety Tracker ───────────────────────────────────────────────────────────

interface UsedTracker {
  breakfast: Set<string>;
  lunch: Set<string>;
  dinner: Set<string>;
  snack: Set<string>;
}

function freshUsedTracker(): UsedTracker {
  return {
    breakfast: new Set(),
    lunch: new Set(),
    dinner: new Set(),
    snack: new Set(),
  };
}

// ── Calorie Balancer ──────────────────────────────────────────────────────────

type MealKey = "breakfast" | "lunch" | "dinner" | "snack";

function balanceDailyCalories(week: DayMeals[]): void {
  for (let iter = 0; iter < 20; iter++) {
    let maxIdx = 0, minIdx = 0;
    for (let i = 1; i < week.length; i++) {
      if (week[i].dailyCalories > week[maxIdx].dailyCalories) maxIdx = i;
      if (week[i].dailyCalories < week[minIdx].dailyCalories) minIdx = i;
    }
    if (week[maxIdx].dailyCalories - week[minIdx].dailyCalories < 200) break;

    let bestKey: MealKey | null = null;
    let bestReduction = 0;
    for (const key of ["breakfast", "lunch", "dinner", "snack"] as MealKey[]) {
      const diff = week[maxIdx][key].calories - week[minIdx][key].calories;
      if (diff > bestReduction) { bestReduction = diff; bestKey = key; }
    }
    if (!bestKey) break;

    const temp = week[maxIdx][bestKey];
    week[maxIdx][bestKey] = week[minIdx][bestKey];
    week[minIdx][bestKey] = temp;

    for (const day of [week[maxIdx], week[minIdx]]) {
      day.dailyCalories = day.breakfast.calories + day.lunch.calories + day.dinner.calories + day.snack.calories;
      day.dailyProtein  = day.breakfast.protein  + day.lunch.protein  + day.dinner.protein  + day.snack.protein;
      day.dailyCarbs    = day.breakfast.carbs    + day.lunch.carbs    + day.dinner.carbs    + day.snack.carbs;
      day.dailyFat      = day.breakfast.fat      + day.lunch.fat      + day.dinner.fat      + day.snack.fat;
      day.dailyCost     = +(day.breakfast.cost   + day.lunch.cost     + day.dinner.cost     + day.snack.cost).toFixed(2);
    }
  }
}

// ── Day Meal Selector ─────────────────────────────────────────────────────────
// Picks meals using goal scoring + calorie targeting.
// When top candidates score similarly, picks randomly among the top 4 to ensure
// two users with identical stats get different plans.

function selectDayMeals(
  bPool: Meal[],
  lPool: Meal[],
  dPool: Meal[],
  sPool: Meal[],
  calorieTarget: number | undefined,
  goal: string,
  usedTracker: UsedTracker,
  rng: () => number
): { breakfast: Meal; lunch: Meal; dinner: Meal; snack: Meal } {
  let allocatedCals = 0;

  function pickBest(pool: Meal[], usedSet: Set<string>, slotsRemaining: number): Meal {
    let available = pool.filter((m) => !usedSet.has(m.id));
    if (available.length === 0) {
      usedSet.clear();
      available = [...pool];
    }

    const targetCals =
      calorieTarget !== undefined
        ? (calorieTarget - allocatedCals) / slotsRemaining
        : undefined;

    const scored = available.map((m) => {
      // Weight calorie fit strongly so the daily target actually drives selection.
      const calFit = targetCals !== undefined ? -Math.abs(m.calories - targetCals) * 3.0 : 0;
      return { m, score: scoreMeal(m, goal) + calFit };
    });
    scored.sort((a, b) => b.score - a.score);

    // Pick among top 2 — enough variety without drifting far from calorie target.
    const topN = Math.min(2, scored.length);
    const pick = Math.floor(rng() * topN);
    const best = scored[pick].m;
    usedSet.add(best.id);
    return best;
  }

  const breakfast = pickBest(bPool, usedTracker.breakfast, 4);
  allocatedCals += breakfast.calories;
  const lunch = pickBest(lPool, usedTracker.lunch, 3);
  allocatedCals += lunch.calories;
  const dinner = pickBest(dPool, usedTracker.dinner, 2);
  allocatedCals += dinner.calories;
  const snack = pickBest(sPool, usedTracker.snack, 1);

  return { breakfast, lunch, dinner, snack };
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function generatePlan(
  budget: number,
  goal: string,
  diet: string,
  totalDays: number,
  stateCode: string,
  calorieTarget?: number,
  dislikedIds: string[] = [],
  planSalt: number = 0
): MealPlan {
  const stateMultiplier = STATE_MULTIPLIERS[stateCode] ?? 1.0;
  const numWeeks = Math.ceil(totalDays / 7);
  const dislikedSet = new Set(dislikedIds);

  // Step 1: Build the weekly grocery cart from the budget allocation.
  const cart = buildWeeklyCart(budget, stateMultiplier, diet, calorieTarget ?? 2000, totalDays);

  // Step 2: Seed deterministically so the same inputs always produce the same plan,
  // but planSalt (generated fresh per session on the client) ensures two users
  // with identical stats see different meals.
  const goalIndex =
    ["muscle_gain", "fat_loss", "maintenance", "endurance", "general_health"].indexOf(goal) + 1;
  const dietIndex =
    ["", "vegetarian", "vegan", "gluten_free", "dairy_free", "halal", "kosher"].indexOf(diet) + 1;
  const stateIndex =
    stateCode.length >= 2 ? stateCode.charCodeAt(0) + stateCode.charCodeAt(1) : 0;
  const seed = (Math.round(budget * 100) + goalIndex * 1000 + dietIndex * 100 + stateIndex + planSalt) >>> 0;
  const rng = seededRng(seed);

  // Step 3: Build meal pools filtered by cart ingredients and dietary rules.
  // Per-meal cost ceilings are intentionally omitted — the weekly cart is the real
  // budget controller. Cost-ceiling filters systematically exclude the highest-calorie
  // meals (which tend to cost slightly more) and cannot be hit by the meal library anyway.
  // Per-slot calorie targets (based on typical meal-size proportions) guide pool ordering
  // so high-calorie meals surface at the top when the user's target demands them.
  const slotCalTargets = calorieTarget
    ? {
        breakfast: calorieTarget * 0.20,
        lunch:     calorieTarget * 0.25,
        dinner:    calorieTarget * 0.40,
        snack:     calorieTarget * 0.15,
      }
    : undefined;
  const bPool = buildPool("breakfast", diet, goal, rng, cart.ingredientKeys, dislikedSet, slotCalTargets?.breakfast);
  const lPool = buildPool("lunch",     diet, goal, rng, cart.ingredientKeys, dislikedSet, slotCalTargets?.lunch);
  const dPool = buildPool("dinner",    diet, goal, rng, cart.ingredientKeys, dislikedSet, slotCalTargets?.dinner);
  const sPool = buildPool("snack",     diet, goal, rng, cart.ingredientKeys, dislikedSet, slotCalTargets?.snack);

  // Step 4: Assign 7 days of meals (the Week 1 template repeated for longer plans).
  const week1Days: DayMeals[] = [];
  const week1Length = Math.min(totalDays, 7);
  const usedTracker = freshUsedTracker();

  for (let i = 0; i < week1Length; i++) {
    const { breakfast, lunch, dinner, snack } = selectDayMeals(
      bPool, lPool, dPool, sPool, calorieTarget, goal, usedTracker, rng
    );

    week1Days.push({
      day: DAY_NAMES[i % 7],
      date: formatDate(i),
      weekIndex: 0,
      dayIndex: i,
      breakfast,
      lunch,
      dinner,
      snack,
      dailyCalories: breakfast.calories + lunch.calories + dinner.calories + snack.calories,
      dailyProtein:  breakfast.protein  + lunch.protein  + dinner.protein  + snack.protein,
      dailyCarbs:    breakfast.carbs    + lunch.carbs    + dinner.carbs    + snack.carbs,
      dailyFat:      breakfast.fat      + lunch.fat      + dinner.fat      + snack.fat,
      dailyCost:     +(breakfast.cost   + lunch.cost     + dinner.cost     + snack.cost).toFixed(2),
    });
  }

  // Step 5: Balance calorie distribution across days.
  balanceDailyCalories(week1Days);

  // Step 6: Expand to full plan length — week 1 repeats every subsequent week.
  const days: DayMeals[] = Array.from({ length: totalDays }, (_, i) => {
    if (i < week1Days.length) return week1Days[i];
    const template = week1Days[i % 7];
    return {
      ...template,
      day: DAY_NAMES[i % 7],
      date: formatDate(i),
      dayIndex: i,
      weekIndex: Math.floor(i / 7),
    };
  });

  const weeks: DayMeals[][] = Array.from({ length: numWeeks }, (_, w) =>
    days.slice(w * 7, w * 7 + 7)
  );

  const avgDailyCalories = Math.round(
    week1Days.reduce((s, d) => s + d.dailyCalories, 0) / week1Days.length
  );
  const avgDailyProtein = Math.round(
    week1Days.reduce((s, d) => s + d.dailyProtein, 0) / week1Days.length
  );

  const weeklyEstimatedCost = cart.totalCost;
  const totalPlanCost = +(weeklyEstimatedCost * numWeeks).toFixed(2);

  // The meal library tops out around 2,980 cal/day (700 breakfast + 860 lunch + 900 dinner + 520 snack).
  // Show a message any time the plan falls more than 5% short of the user's target.
  const LIBRARY_MAX_DAILY = 2980;
  let budgetCapMessage: string | undefined;
  if (calorieTarget && avgDailyCalories < Math.round(calorieTarget * 0.95)) {
    const isLibraryCapped = avgDailyCalories >= Math.round(LIBRARY_MAX_DAILY * 0.95);
    budgetCapMessage = isLibraryCapped
      ? `Plan averages ${avgDailyCalories.toLocaleString()} cal/day — the current meal library` +
        ` tops out near ${LIBRARY_MAX_DAILY.toLocaleString()} cal/day vs your` +
        ` ${calorieTarget.toLocaleString()} cal goal`
      : `Plan averages ${avgDailyCalories.toLocaleString()} cal/day toward your` +
        ` ${calorieTarget.toLocaleString()} cal goal — increase your budget to unlock` +
        ` more calorie-dense ingredients`;
  }

  return {
    days,
    weeks,
    totalDays,
    numWeeks,
    weeklyEstimatedCost,
    totalPlanCost,
    avgDailyCalories,
    avgDailyProtein,
    calorieTarget,
    budgetCapMessage,
    weeklyCart: { items: cart.items, totalCost: cart.totalCost },
  };
}
