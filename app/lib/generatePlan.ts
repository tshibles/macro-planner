import { meals, Meal, DietaryFlag } from "@/app/data/meals";
import { STATE_MULTIPLIERS } from "@/app/data/stateMultipliers";
import { normalizeKey } from "@/app/lib/normalizeIngredient";
import { isPantryStaple, computePurchasable } from "@/app/data/purchasableUnits";

export interface CartItem {
  key: string;
  displayName: string;
  category: "protein" | "carb" | "produce";
  packages: number;
  purchaseLabel: string;
  pricePerUnit: number;
  totalCost: number;
}

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

// Format a scaled number into a human-readable cooking quantity.
function formatCookingNumber(n: number): string {
  if (n <= 0) return "0";
  const whole = Math.floor(n);
  const frac = n - whole;
  const FRACS: [number, string][] = [[1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]];
  for (const [val, str] of FRACS) {
    if (Math.abs(frac - val) < 0.09) return whole > 0 ? `${whole} ${str}` : str;
  }
  if (frac < 0.09) return String(whole || 1);
  return n < 10 ? +n.toFixed(1) + "" : String(Math.round(n));
}

// Multiply the leading numeric token (integer, fraction, mixed number) in an amount string.
function scaleIngredientAmount(amount: string, multiplier: number): string {
  if (Math.abs(multiplier - 1) < 0.02) return amount;
  const s = amount.trim();
  if (/^(to taste|pinch|dash|handful|few|as needed|optional)/i.test(s)) return amount;

  let parsed: number | null = null;
  let matchEnd = 0;
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) { parsed = parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]); matchEnd = mixed[0].length; }
  else {
    const frac = s.match(/^(\d+)\/(\d+)/);
    if (frac) { parsed = parseInt(frac[1]) / parseInt(frac[2]); matchEnd = frac[0].length; }
    else {
      const dec = s.match(/^(\d+(?:\.\d+)?)/);
      if (dec) { parsed = parseFloat(dec[1]); matchEnd = dec[0].length; }
    }
  }
  if (parsed === null || parsed === 0) return amount;
  return formatCookingNumber(parsed * multiplier) + s.slice(matchEnd);
}

// Return a shallow copy of meal with all macros and ingredient amounts scaled.
// The original meal object is never mutated.
function scaleMeal(meal: Meal, multiplier: number): Meal {
  const m = +multiplier.toFixed(2);
  return {
    ...meal,
    calories: Math.round(meal.calories * m),
    protein: Math.round(meal.protein * m),
    carbs: Math.round(meal.carbs * m),
    fat: Math.round(meal.fat * m),
    cost: +(meal.cost * m).toFixed(2),
    portionMultiplier: m,
    ingredients: meal.ingredients.map((ing) => ({
      ...ing,
      amount: scaleIngredientAmount(ing.amount, m),
    })),
  };
}

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
  vegetarian:   ["meat", "fish"],
  vegan:        ["meat", "dairy", "fish", "eggs"],
  gluten_free:  ["gluten"],
  dairy_free:   ["dairy"],
  pescatarian:  ["meat"],
  halal:        ["pork"],
  kosher:       ["pork"],
};

function isAllowed(meal: Meal, diets: string[]): boolean {
  if (diets.length === 0) return true;
  const excluded = new Set<DietaryFlag>();
  for (const diet of diets) {
    for (const flag of EXCLUDED_FLAGS[diet] ?? []) excluded.add(flag);
  }
  return !meal.contains.some((f) => excluded.has(f));
}

function hasAllergen(meal: Meal, allergies: string[]): boolean {
  if (allergies.length === 0) return false;
  // Strip a trailing 's' to get the root word so 'eggs' matches 'egg white', 'large eggs', etc.
  const roots = allergies.map((a) => a.toLowerCase().trim().replace(/s$/i, ""));
  return meal.ingredients.some((ing) =>
    roots.some((root) => ing.item.toLowerCase().includes(root))
  );
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

// ── Budget Tier ───────────────────────────────────────────────────────────────

function determineBudgetTier(perPersonBudget: number): 1 | 2 | 3 {
  if (perPersonBudget < 70) return 1;
  if (perPersonBudget < 110) return 2;
  return 3;
}

function categorizeIngredient(key: string): "protein" | "carb" | "produce" {
  if (/chicken|turkey|beef|tuna|salmon|shrimp|egg|tofu|yogurt|cottage|cheese|ham|bacon|lentil|chickpea|bean|protein powder/.test(key)) return "protein";
  if (/oat|rice|bread|pasta|tortilla|bagel|pita|quinoa|granola|potato|noodle/.test(key)) return "carb";
  return "produce";
}

// ── Pool Builder ──────────────────────────────────────────────────────────────
// calorieDensityScore = calorieTarget / weeklyBudget (daily cal per weekly dollar).
// > 40: high pressure — open all tiers, keep only the top-60% by cal/$ so the
//       plan maximises calories-per-dollar for users who need every cheap calorie.
// < 25: low pressure  — bump the tier ceiling up by 1 to unlock variety meals
//       for users whose TDEE is easy to hit even on modest budgets.
// 25-40: normal — use the base budget tier as-is.

function buildPool(
  type: Meal["type"],
  diets: string[],
  allergies: string[],
  goal: string,
  rng: () => number,
  budgetTier: 1 | 2 | 3,
  dislikedIds: Set<string>,
  calorieDensityScore: number
): Meal[] {
  // Effective tier ceiling after calorie-density adjustment
  let effectiveTier: 1 | 2 | 3 = budgetTier;
  if (calorieDensityScore > 40) {
    effectiveTier = 3; // include all tiers; cal/$ filter applied below
  } else if (calorieDensityScore < 25 && budgetTier < 3) {
    effectiveTier = (budgetTier + 1) as 1 | 2 | 3;
  }

  const eligible = meals.filter((m) => {
    if (m.type !== type) return false;
    if (m.budgetTier > effectiveTier) return false;
    if (!isAllowed(m, diets)) return false;
    if (hasAllergen(m, allergies)) return false;
    if (dislikedIds.has(m.id)) return false;
    return true;
  });

  // Fallback: if pool is too small, relax budget tier by one level.
  let pool = eligible;
  if (eligible.length < 3) {
    const relaxedTier = Math.min(effectiveTier + 1, 3) as 1 | 2 | 3;
    console.warn(
      `[generatePlan] ${type} pool has only ${eligible.length} meal(s) after filtering; relaxing budget tier ${effectiveTier} → ${relaxedTier}`
    );
    pool = meals.filter(
      (m) =>
        m.type === type &&
        m.budgetTier <= relaxedTier &&
        isAllowed(m, diets) &&
        !hasAllergen(m, allergies) &&
        !dislikedIds.has(m.id)
    );
  }

  // High calorie-density: restrict to the most calorie-efficient meals (top 60%, min 7).
  // Tier-3 premiums naturally drop out because they have poor cal/$ ratios.
  if (calorieDensityScore > 40) {
    const byCpd = [...pool].sort((a, b) => (b.caloriesPerDollar ?? 0) - (a.caloriesPerDollar ?? 0));
    pool = byCpd.slice(0, Math.max(7, Math.ceil(byCpd.length * 0.6)));
  }

  // Sort by goal score once, then shuffle for variety.
  const sorted = [...pool].sort((a, b) => scoreMeal(b, goal) - scoreMeal(a, goal));
  const shuffled = shuffle(sorted, rng);
  console.log(
    `[generatePlan] ${type} shuffled pool (${shuffled.length}) [cds=${calorieDensityScore.toFixed(1)},tier=${effectiveTier}]: [${shuffled.map((m) => m.name).join(" | ")}]`
  );
  return shuffled;
}

// ── Pool Index Tracker ────────────────────────────────────────────────────────
// Tracks which position in each slot's shuffled pool we're at.
// Advances by 1 each day; wraps only after all meals in the pool are used.

interface UsedTracker {
  breakfast: number;
  lunch: number;
  dinner: number;
  snack: number;
}

function freshUsedTracker(): UsedTracker {
  return { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
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
// Picks the next meal from each slot's shuffled pool in order.
// No per-day scoring — the pool was already sorted by goal and shuffled once.

function selectDayMeals(
  bPool: Meal[],
  lPool: Meal[],
  dPool: Meal[],
  sPool: Meal[],
  usedTracker: UsedTracker,
  dayLabel: string
): { breakfast: Meal; lunch: Meal; dinner: Meal; snack: Meal } {
  function pick(pool: Meal[], slot: keyof UsedTracker): Meal {
    const idx = usedTracker[slot] % pool.length;
    const meal = pool[idx];
    console.log(`[generatePlan] ${dayLabel} ${slot}: index=${idx}/${pool.length} → "${meal.name}" (id=${meal.id})`);
    usedTracker[slot]++;
    return meal;
  }

  const breakfast = pick(bPool, "breakfast");
  const lunch     = pick(lPool, "lunch");
  const dinner    = pick(dPool, "dinner");
  const snack     = pick(sPool, "snack");
  return { breakfast, lunch, dinner, snack };
}

// ── Grocery List Builder ──────────────────────────────────────────────────────
// Aggregates all ingredients from the week 1 meal template, normalizes names,
// and computes purchasable quantities using PURCHASABLE_MAP + state multiplier.

function buildGroceryFromMeals(
  week1: DayMeals[],
  stateMultiplier: number
): WeeklyCartSummary {
  const ingredientMap = new Map<string, { amounts: string[]; rawKey: string }>();

  for (const day of week1) {
    for (const meal of [day.breakfast, day.lunch, day.dinner, day.snack]) {
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key)) continue;
        if (!ingredientMap.has(key)) {
          ingredientMap.set(key, { amounts: [], rawKey: ing.item });
        }
        ingredientMap.get(key)!.amounts.push(ing.amount);
      }
    }
  }

  const items: CartItem[] = Array.from(ingredientMap.entries()).map(([key, { amounts, rawKey }]) => {
    const result = computePurchasable(key, amounts, amounts.length, stateMultiplier);
    return {
      key,
      displayName: rawKey.replace(/\b\w/g, (c: string) => c.toUpperCase()),
      category: categorizeIngredient(key),
      packages: result.qty,
      purchaseLabel: result.label,
      pricePerUnit: result.pricePerUnit,
      totalCost: result.total,
    };
  });

  const totalCost = +items.reduce((s, i) => s + i.totalCost, 0).toFixed(2);
  return { items, totalCost };
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function generatePlan(
  budget: number,
  goal: string,
  diets: string[],
  totalDays: number,
  stateCode: string,
  numberOfPeople: number = 1,
  calorieTarget?: number,
  dislikedIds: string[] = [],
  planSalt: number = 0,
  allergies: string[] = []
): MealPlan {
  const stateMultiplier = STATE_MULTIPLIERS[stateCode] ?? 1.0;
  const numWeeks = Math.ceil(totalDays / 7);
  const dislikedSet = new Set(dislikedIds);

  // Step 1: Determine budget tier from per-person weekly budget.
  const perPersonBudget = budget / Math.max(1, numberOfPeople);
  const budgetTier = determineBudgetTier(perPersonBudget);

  // calorieDensityScore = daily calorie target / weekly per-person budget.
  // Captures how many calories per weekly dollar the user needs.
  // > 40: tight budget relative to calorie needs → maximise cal/$ (bulk staples).
  // < 25: easy budget relative to calorie needs → unlock variety (higher-tier meals).
  const calorieDensityScore = (calorieTarget ?? 2000) / Math.max(1, perPersonBudget);
  console.log(`[generatePlan] calorieDensityScore=${calorieDensityScore.toFixed(1)} (calorieTarget=${calorieTarget ?? 2000}, perPersonBudget=$${perPersonBudget})`);

  // Step 2: Seed deterministically so the same inputs always produce the same plan,
  // but planSalt (generated fresh per session on the client) ensures two users
  // with identical stats see different meals.
  const goalIndex =
    ["muscle_gain", "fat_loss", "maintenance", "endurance", "general_health"].indexOf(goal) + 1;
  const dietKey = diets.slice().sort().join(",");
  const dietHash = dietKey.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
  const stateIndex =
    stateCode.length >= 2 ? stateCode.charCodeAt(0) + stateCode.charCodeAt(1) : 0;
  const seed = (Math.round(budget * 100) + goalIndex * 1000 + dietHash + stateIndex + planSalt) >>> 0;
  const rng = seededRng(seed);

  // Step 3: Build meal pools filtered by budget tier, dietary rules, and allergens.
  // calorieDensityScore adjusts the effective tier ceiling and applies a cal/$ filter
  // when calorie pressure is high. Each pool is sorted by goal score once, then
  // shuffled — variety is guaranteed by consuming the pool in order across the 7-day template.
  const bPool = buildPool("breakfast", diets, allergies, goal, rng, budgetTier, dislikedSet, calorieDensityScore);
  const lPool = buildPool("lunch",     diets, allergies, goal, rng, budgetTier, dislikedSet, calorieDensityScore);
  const dPool = buildPool("dinner",    diets, allergies, goal, rng, budgetTier, dislikedSet, calorieDensityScore);
  const sPool = buildPool("snack",     diets, allergies, goal, rng, budgetTier, dislikedSet, calorieDensityScore);
  console.log(`[generatePlan] Pool sizes after filtering — breakfast: ${bPool.length}, lunch: ${lPool.length}, dinner: ${dPool.length}, snack: ${sPool.length} (budgetTier=${budgetTier}, diets=[${diets.join(",")}], allergies=[${allergies.join(",")}])`);
  if (bPool.length < 7 || lPool.length < 7 || dPool.length < 7 || sPool.length < 7) {
    console.warn(`[generatePlan] One or more pools have fewer than 7 unique meals — some meals will repeat within the week.`);
  }

  // Step 4: Assign 7 days of meals (the Week 1 template repeated for longer plans).
  const week1Days: DayMeals[] = [];
  const week1Length = Math.min(totalDays, 7);
  const usedTracker = freshUsedTracker();

  for (let i = 0; i < week1Length; i++) {
    const { breakfast, lunch, dinner, snack } = selectDayMeals(
      bPool, lPool, dPool, sPool, usedTracker, DAY_NAMES[i % 7]
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

  // Step 5.5: Budget enforcement — if the projected grocery total exceeds the
  // weekly budget, swap the most expensive reducible meal to the cheapest
  // same-type same-tier alternative until the total fits (or nothing left to cut).
  {
    const poolBySlot: Record<MealKey, Meal[]> = {
      breakfast: bPool, lunch: lPool, dinner: dPool, snack: sPool,
    };
    for (let iter = 0; iter < 28; iter++) {
      const tentCart = buildGroceryFromMeals(week1Days, stateMultiplier);
      if (tentCart.totalCost <= perPersonBudget) break;

      // Find the most expensive meal that has a cheaper *unique* option in its pool.
      // "Unique" means not already assigned to another day in the same slot.
      let maxReducibleCost = -1;
      let swapDay = -1;
      let swapSlot: MealKey = "dinner";
      for (let d = 0; d < week1Days.length; d++) {
        for (const slot of ["dinner", "lunch", "breakfast", "snack"] as MealKey[]) {
          const cur = week1Days[d][slot];
          const usedElsewhere = new Set(
            week1Days.filter((_, di) => di !== d).map((day) => day[slot as MealKey].id)
          );
          const hasUniqueAlt = poolBySlot[slot].some(
            (m) => m.id !== cur.id && m.cost < cur.cost && !usedElsewhere.has(m.id)
          );
          if (hasUniqueAlt && cur.cost > maxReducibleCost) {
            maxReducibleCost = cur.cost;
            swapDay = d;
            swapSlot = slot;
          }
        }
      }
      if (swapDay === -1) break; // no meal can be swapped to a unique cheaper alternative

      const cur = week1Days[swapDay][swapSlot];
      const usedIdsInSlot = new Set(
        week1Days.filter((_, di) => di !== swapDay).map((d) => d[swapSlot].id)
      );
      const alt = poolBySlot[swapSlot]
        .filter((m) => m.id !== cur.id && m.cost < cur.cost && !usedIdsInSlot.has(m.id))
        .sort((a, b) => a.cost - b.cost)[0];
      if (!alt) break;

      week1Days[swapDay][swapSlot] = alt;
      const day = week1Days[swapDay];
      day.dailyCalories = day.breakfast.calories + day.lunch.calories + day.dinner.calories + day.snack.calories;
      day.dailyProtein  = day.breakfast.protein  + day.lunch.protein  + day.dinner.protein  + day.snack.protein;
      day.dailyCarbs    = day.breakfast.carbs    + day.lunch.carbs    + day.dinner.carbs    + day.snack.carbs;
      day.dailyFat      = day.breakfast.fat      + day.lunch.fat      + day.dinner.fat      + day.snack.fat;
      day.dailyCost     = +(day.breakfast.cost + day.lunch.cost + day.dinner.cost + day.snack.cost).toFixed(2);
    }
  }

  // Step 5.7: Portion scaling — when the user has a calorie target, scale each
  // day's meals so the combined calories match the target.  Each day gets its own
  // multiplier because different meal combos have different base calorie totals.
  // Multiplier is clamped to [0.5, 2.0] to keep portions realistic.
  let portionCapped = false;
  if (calorieTarget) {
    for (const day of week1Days) {
      const baseTotal = day.breakfast.calories + day.lunch.calories + day.dinner.calories + day.snack.calories;
      const raw = calorieTarget / Math.max(baseTotal, 1);
      const multiplier = Math.min(2.0, Math.max(0.5, raw));
      if (raw > 2.0 || raw < 0.5) portionCapped = true;

      day.breakfast = scaleMeal(day.breakfast, multiplier);
      day.lunch     = scaleMeal(day.lunch,     multiplier);
      day.dinner    = scaleMeal(day.dinner,     multiplier);
      day.snack     = scaleMeal(day.snack,      multiplier);

      day.dailyCalories = day.breakfast.calories + day.lunch.calories + day.dinner.calories + day.snack.calories;
      day.dailyProtein  = day.breakfast.protein  + day.lunch.protein  + day.dinner.protein  + day.snack.protein;
      day.dailyCarbs    = day.breakfast.carbs    + day.lunch.carbs    + day.dinner.carbs    + day.snack.carbs;
      day.dailyFat      = day.breakfast.fat      + day.lunch.fat      + day.dinner.fat      + day.snack.fat;
      day.dailyCost     = +(day.breakfast.cost + day.lunch.cost + day.dinner.cost + day.snack.cost).toFixed(2);
    }
  }

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

  // Step 7: Generate grocery list from the selected week 1 meals.
  const weeklyCart = buildGroceryFromMeals(week1Days, stateMultiplier);
  const weeklyEstimatedCost = weeklyCart.totalCost;
  const totalPlanCost = +(weeklyEstimatedCost * numWeeks).toFixed(2);

  let budgetCapMessage: string | undefined;
  if (calorieTarget && avgDailyCalories < Math.round(calorieTarget * 0.95)) {
    budgetCapMessage = portionCapped
      ? `Portions capped at ${calorieTarget > avgDailyCalories ? "2×" : "0.5×"} — plan averages` +
        ` ${avgDailyCalories.toLocaleString()} cal/day vs your ${calorieTarget.toLocaleString()} cal goal.` +
        ` Consider a higher budget or fewer dietary restrictions to unlock higher-calorie meals.`
      : `Plan averages ${avgDailyCalories.toLocaleString()} cal/day toward your` +
        ` ${calorieTarget.toLocaleString()} cal goal`;
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
    weeklyCart,
  };
}
