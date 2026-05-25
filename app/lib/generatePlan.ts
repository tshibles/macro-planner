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

// 0 = comfortable budget, 1 = extremely tight. Derived from how many calories
// per dollar the plan must squeeze out of the weekly budget.
function computeBudgetPressure(calorieTarget: number | undefined, budget: number): number {
  if (!calorieTarget || budget <= 0) return 0;
  const dailyBudget = budget / 7;
  const calPerDollarNeeded = calorieTarget / dailyBudget;
  // 200 cal/$ feels easy; 700 cal/$ is extremely tight. Linear 0→1.
  return Math.min(1, Math.max(0, (calPerDollarNeeded - 200) / 500));
}

function scoreMeal(meal: Meal, goal: string, budgetPressure: number = 0): number {
  const proteinDensity = meal.protein / (meal.calories || 1);
  let baseScore: number;
  switch (goal) {
    case "muscle_gain":
      baseScore = meal.protein * 3 + proteinDensity * 200;
      break;
    case "fat_loss":
      baseScore = meal.protein * 3 - meal.calories * 0.3 + proteinDensity * 200;
      break;
    case "endurance":
      baseScore = meal.carbs * 2 + meal.calories * 0.05;
      break;
    case "maintenance":
      baseScore = meal.protein * 1.5 + meal.carbs * 0.5 - meal.fat * 0.2;
      break;
    case "general_health":
      baseScore = meal.protein * 2 - meal.fat * 0.5 + meal.carbs * 0.3;
      break;
    default:
      baseScore = 0;
  }
  // Under budget pressure, boost meals with high calories-per-dollar so the
  // planner naturally shifts toward cheap staples (oats, eggs, rice, potatoes).
  // Scale factor 0.5 keeps cost score comparable in magnitude to goal score.
  if (budgetPressure > 0) {
    const calPerDollar = meal.calories / (meal.cost || 0.01);
    baseScore += calPerDollar * 0.5 * budgetPressure;
  }
  return baseScore;
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
  rng: () => number,
  budgetPressure: number = 0
): Meal[] {
  const eligible = meals.filter((m) => m.type === type && isAllowed(m, diet));
  if (eligible.length === 0) return meals.filter((m) => m.type === type).slice(0, 5);
  const sorted = [...eligible].sort(
    (a, b) => scoreMeal(b, goal, budgetPressure) - scoreMeal(a, goal, budgetPressure)
  );
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
  usedTracker: UsedTracker,
  budgetPressure: number = 0
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
      return { m, score: scoreMeal(m, goal, budgetPressure) + calFit + overlap };
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

// ── Portion Scaling ───────────────────────────────────────────────────────────
// After meal selection, scale macros and ingredient quantities so the day's
// total hits the user's calorie target. Cap at 2.5× to keep portions realistic.

function formatScaledNum(n: number): string {
  const r = Math.round(n * 4) / 4;
  const whole = Math.floor(r);
  const frac = r - whole;
  if (frac < 0.01) return String(whole || 0);
  if (frac < 0.38) return whole > 0 ? `${whole} 1/4` : "1/4";
  if (frac < 0.63) return whole > 0 ? `${whole} 1/2` : "1/2";
  return whole > 0 ? `${whole} 3/4` : "3/4";
}

function scaleAmount(amount: string, multiplier: number): string {
  const s = amount.trim();
  if (/^(to taste|pinch|dash|handful|few|as needed|optional)/i.test(s)) return s;

  let num: number | null = null;
  let rest = "";

  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)(.*)/);
  if (mixed) {
    num = parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
    rest = mixed[4];
  } else {
    const frac = s.match(/^(\d+)\/(\d+)(.*)/);
    if (frac) {
      num = parseInt(frac[1]) / parseInt(frac[2]);
      rest = frac[3];
    } else {
      const dec = s.match(/^(\d+(?:\.\d+)?)(.*)/);
      if (dec) {
        num = parseFloat(dec[1]);
        rest = dec[2];
      }
    }
  }

  if (num === null) return s;
  return formatScaledNum(num * multiplier) + rest;
}

function scaleMeal(meal: Meal, multiplier: number): Meal {
  return {
    ...meal,
    calories: Math.round(meal.calories * multiplier),
    protein: Math.round(meal.protein * multiplier),
    carbs: Math.round(meal.carbs * multiplier),
    fat: Math.round(meal.fat * multiplier),
    cost: +((meal.cost * multiplier).toFixed(2)),
    portionMultiplier: +multiplier.toFixed(2),
    ingredients: meal.ingredients.map((ing) => ({
      ...ing,
      amount: scaleAmount(ing.amount, multiplier),
    })),
  };
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
  const budgetPressure = computeBudgetPressure(calorieTarget, budget);

  const goalIndex =
    ["muscle_gain", "fat_loss", "maintenance", "endurance", "general_health"].indexOf(goal) + 1;
  const dietIndex =
    ["", "vegetarian", "vegan", "gluten_free", "dairy_free", "halal", "kosher"].indexOf(diet) + 1;
  const stateIndex =
    stateCode.length >= 2 ? stateCode.charCodeAt(0) + stateCode.charCodeAt(1) : 0;
  const seed =
    Math.round(budget * 100) + goalIndex * 1000 + dietIndex * 100 + stateIndex;
  const rng = seededRng(seed);

  const bPool = buildPool("breakfast", diet, goal, rng, budgetPressure);
  const lPool = buildPool("lunch", diet, goal, rng, budgetPressure);
  const dPool = buildPool("dinner", diet, goal, rng, budgetPressure);
  const sPool = buildPool("snack", diet, goal, rng, budgetPressure);

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
      usedTracker,
      budgetPressure
    );

    // Scale portions to hit calorie target (cap at 2.5× for realism)
    const rawCals = breakfast.calories + lunch.calories + dinner.calories + snack.calories;
    const portionMult =
      calorieTarget && rawCals > 0
        ? Math.min(2.5, Math.max(1.0, calorieTarget / rawCals))
        : 1.0;
    const scaledB = portionMult > 1.02 ? scaleMeal(breakfast, portionMult) : breakfast;
    const scaledL = portionMult > 1.02 ? scaleMeal(lunch, portionMult) : lunch;
    const scaledD = portionMult > 1.02 ? scaleMeal(dinner, portionMult) : dinner;
    const scaledS = portionMult > 1.02 ? scaleMeal(snack, portionMult) : snack;

    addMealToCart(cart, scaledB);
    addMealToCart(cart, scaledL);
    addMealToCart(cart, scaledD);
    addMealToCart(cart, scaledS);

    week1Days.push({
      day: DAY_NAMES[i % 7],
      date: formatDate(i),
      weekIndex: 0,
      dayIndex: i,
      breakfast: scaledB,
      lunch: scaledL,
      dinner: scaledD,
      snack: scaledS,
      dailyCalories: scaledB.calories + scaledL.calories + scaledD.calories + scaledS.calories,
      dailyProtein: scaledB.protein + scaledL.protein + scaledD.protein + scaledS.protein,
      dailyCarbs: scaledB.carbs + scaledL.carbs + scaledD.carbs + scaledS.carbs,
      dailyFat: scaledB.fat + scaledL.fat + scaledD.fat + scaledS.fat,
      dailyCost: +(scaledB.cost + scaledL.cost + scaledD.cost + scaledS.cost).toFixed(2),
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
