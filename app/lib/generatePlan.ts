import { meals, Meal, DietaryFlag } from "@/app/data/meals";
import { STATE_MULTIPLIERS } from "@/app/data/stateMultipliers";
import { computePurchasable, isPantryStaple } from "@/app/data/purchasableUnits";
import { normalizeKey } from "@/app/lib/normalizeIngredient";

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

export interface MealPlan {
  days: DayMeals[];
  weeks: DayMeals[][];
  totalDays: number;
  weeklyEstimatedCost: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
  calorieTarget?: number;
}

// ── Ingredient Cart ──────────────────────────────────────────────────────────
// Tracks accumulated recipe ingredients across the week so we can compute
// the actual grocery cost (packages bought once, shared across days).

type CartEntry = { amounts: string[]; count: number };
type Cart = Map<string, CartEntry>;


function cloneCart(cart: Cart): Cart {
  const c: Cart = new Map();
  cart.forEach((v, k) => c.set(k, { amounts: [...v.amounts], count: v.count }));
  return c;
}

function addMealToCart(cart: Cart, meal: Meal): void {
  for (const ing of meal.ingredients) {
    const key = normalizeKey(ing.item);
    const existing = cart.get(key);
    if (existing) {
      existing.amounts.push(ing.amount);
      existing.count++;
    } else {
      cart.set(key, { amounts: [ing.amount], count: 1 });
    }
  }
}

function computeCartTotal(cart: Cart, multiplier: number): number {
  let total = 0;
  cart.forEach(({ amounts, count }, key) => {
    if (isPantryStaple(key)) return;
    total += computePurchasable(key, amounts, count, multiplier).total;
  });
  return total;
}

// Number of non-pantry ingredients in `meal` that are already in the cart.
// Higher overlap → lower marginal grocery cost.
function overlapCount(meal: Meal, cart: Cart): number {
  let n = 0;
  for (const ing of meal.ingredients) {
    const key = normalizeKey(ing.item);
    if (cart.has(key) && !isPantryStaple(key)) n++;
  }
  return n;
}

// ── Pool / Scoring Helpers ───────────────────────────────────────────────────

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
  vegan: ["meat", "dairy", "fish", "eggs"],
  gluten_free: ["gluten"],
  dairy_free: ["dairy"],
  halal: ["pork"],
  kosher: ["pork"],
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

function buildPool(
  type: Meal["type"],
  diet: string,
  goal: string,
  rng: () => number
): Meal[] {
  const eligible = meals.filter((m) => m.type === type && isAllowed(m, diet));
  if (eligible.length === 0) return meals.filter((m) => m.type === type).slice(0, 5);
  const sorted = [...eligible].sort((a, b) => scoreMeal(b, goal) - scoreMeal(a, goal));
  const topHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
  const bottomHalf = sorted.slice(Math.ceil(sorted.length / 2));
  return [...shuffle(topHalf, rng), ...shuffle(bottomHalf, rng)];
}

// ── Round-Robin Variety Tracker ──────────────────────────────────────────────

// Tracks which meal IDs have already been used per slot type so we can enforce
// round-robin rotation: a meal won't be repeated until every eligible meal in
// that slot's pool has been used at least once.
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

// ── Day Selection ────────────────────────────────────────────────────────────

// Greedily pick the best meal for each slot independently.
// Scores each candidate by goal nutrition + calorie proximity + ingredient overlap.
// No combination search — O(n) per slot instead of O(n^4).
function selectDayMeals(
  _dayIndex: number,
  bPool: Meal[],
  lPool: Meal[],
  dPool: Meal[],
  sPool: Meal[],
  cart: Cart,
  budget: number,
  multiplier: number,
  calorieTarget: number | undefined,
  goal: string,
  usedTracker: UsedTracker
): { breakfast: Meal; lunch: Meal; dinner: Meal; snack: Meal } {
  // localCart tracks what we've committed within this day so overlap scoring
  // for later slots reflects intra-day purchases.
  const localCart = cloneCart(cart);
  let allocatedCals = 0;

  function pickBest(pool: Meal[], usedSet: Set<string>, remainingSlots: number): Meal {
    // Round-robin: exclude already-used meals; reset when all have been used.
    let available = pool.filter((m) => !usedSet.has(m.id));
    if (available.length === 0) {
      usedSet.clear();
      available = pool;
    }

    const targetCals =
      calorieTarget !== undefined
        ? (calorieTarget - allocatedCals) / remainingSlots
        : undefined;

    const scored = available.map((m) => {
      const calFit =
        targetCals !== undefined ? -Math.abs(m.calories - targetCals) * 0.5 : 0;
      const overlap = overlapCount(m, localCart) * 5;
      return { m, score: scoreMeal(m, goal) + calFit + overlap };
    });
    scored.sort((a, b) => b.score - a.score);

    // Take highest-scored meal that keeps cumulative cart within budget.
    for (const { m } of scored) {
      const testCart = cloneCart(localCart);
      addMealToCart(testCart, m);
      if (computeCartTotal(testCart, multiplier) <= budget) {
        usedSet.add(m.id);
        return m;
      }
    }

    // Fallback: nothing fits budget — pick the meal with the lowest marginal
    // grocery cost to minimise the overrun rather than picking the best score.
    const currentTotal = computeCartTotal(localCart, multiplier);
    let cheapestIdx = 0;
    let cheapestMarginal = Infinity;
    for (let i = 0; i < scored.length; i++) {
      const testCart = cloneCart(localCart);
      addMealToCart(testCart, scored[i].m);
      const marginal = computeCartTotal(testCart, multiplier) - currentTotal;
      if (marginal < cheapestMarginal) {
        cheapestMarginal = marginal;
        cheapestIdx = i;
      }
    }
    usedSet.add(scored[cheapestIdx].m.id);
    return scored[cheapestIdx].m;
  }

  const breakfast = pickBest(bPool, usedTracker.breakfast, 4);
  addMealToCart(localCart, breakfast);
  allocatedCals += breakfast.calories;

  const lunch = pickBest(lPool, usedTracker.lunch, 3);
  addMealToCart(localCart, lunch);
  allocatedCals += lunch.calories;

  const dinner = pickBest(dPool, usedTracker.dinner, 2);
  addMealToCart(localCart, dinner);
  allocatedCals += dinner.calories;

  const snack = pickBest(sPool, usedTracker.snack, 1);

  return { breakfast, lunch, dinner, snack };
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function generatePlan(
  budget: number,
  goal: string,
  diet: string,
  totalDays: number,
  stateCode: string,
  calorieTarget?: number
): MealPlan {
  const multiplier = STATE_MULTIPLIERS[stateCode] ?? 1.0;

  const goalIndex =
    ["muscle_gain", "fat_loss", "maintenance", "endurance", "general_health"].indexOf(goal) + 1;
  const dietIndex =
    ["", "vegetarian", "vegan", "gluten_free", "dairy_free", "halal", "kosher"].indexOf(diet) + 1;
  const stateIndex =
    stateCode.length >= 2 ? stateCode.charCodeAt(0) + stateCode.charCodeAt(1) : 0;
  const seed =
    Math.round(budget * 100) + goalIndex * 1000 + dietIndex * 100 + stateIndex;
  const rng = seededRng(seed);

  const bPool = buildPool("breakfast", diet, goal, rng);
  const lPool = buildPool("lunch", diet, goal, rng);
  const dPool = buildPool("dinner", diet, goal, rng);
  const sPool = buildPool("snack", diet, goal, rng);

  // ── Week 1: budget-aware greedy selection ──────────────────────────────────
  // We build the ingredient cart incrementally across 7 days.
  // Each day's meal combo is chosen to stay within the weekly grocery budget
  // while maximising goal nutrition score and ingredient overlap with the
  // already-purchased cart (overlap = near-zero marginal cost).

  const cart: Cart = new Map();
  const week1Days: DayMeals[] = [];
  const week1Length = Math.min(totalDays, 7);
  const usedTracker = freshUsedTracker();

  for (let i = 0; i < week1Length; i++) {
    const { breakfast, lunch, dinner, snack } = selectDayMeals(
      i,
      bPool,
      lPool,
      dPool,
      sPool,
      cart,
      budget,
      multiplier,
      calorieTarget,
      goal,
      usedTracker
    );

    addMealToCart(cart, breakfast);
    addMealToCart(cart, lunch);
    addMealToCart(cart, dinner);
    addMealToCart(cart, snack);

    week1Days.push({
      day: DAY_NAMES[i % 7],
      date: formatDate(i),
      weekIndex: 0,
      dayIndex: i,
      breakfast,
      lunch,
      dinner,
      snack,
      dailyCalories:
        breakfast.calories + lunch.calories + dinner.calories + snack.calories,
      dailyProtein:
        breakfast.protein + lunch.protein + dinner.protein + snack.protein,
      dailyCarbs: breakfast.carbs + lunch.carbs + dinner.carbs + snack.carbs,
      dailyFat: breakfast.fat + lunch.fat + dinner.fat + snack.fat,
      dailyCost: +(
        breakfast.cost +
        lunch.cost +
        dinner.cost +
        snack.cost
      ).toFixed(2),
    });
  }

  // ── Week 2+: repeat week 1 pattern with updated dates/indices ─────────────
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

  const numWeeks = Math.ceil(totalDays / 7);
  const weeks: DayMeals[][] = Array.from({ length: numWeeks }, (_, w) =>
    days.slice(w * 7, w * 7 + 7)
  );

  // The weekly grocery cost is the actual cost of purchasing all week-1
  // ingredients at retail (packages, not per-serving fractions).
  const weeklyEstimatedCost = +computeCartTotal(cart, multiplier).toFixed(2);

  const avgDailyCalories = Math.round(
    days.reduce((s, d) => s + d.dailyCalories, 0) / days.length
  );
  const avgDailyProtein = Math.round(
    days.reduce((s, d) => s + d.dailyProtein, 0) / days.length
  );

  return {
    days,
    weeks,
    totalDays,
    weeklyEstimatedCost,
    avgDailyCalories,
    avgDailyProtein,
    calorieTarget,
  };
}
