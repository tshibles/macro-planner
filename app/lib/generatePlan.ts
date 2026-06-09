import { meals, Meal, DietaryFlag } from "@/app/data/meals";
import { STATE_MULTIPLIERS } from "@/app/data/stateMultipliers";
import { normalizeKey } from "@/app/lib/normalizeIngredient";
import { isPantryStaple, computePurchasable, PURCHASABLE_MAP, lookupPurchasable } from "@/app/data/purchasableUnits";

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
  proteinTarget?: number;
  budgetCapMessage?: string;
  cartFallbackUsed?: boolean;
  weeklyCart: WeeklyCartSummary;
}

// Internal purchase record — a superset of CartItem with tracking fields.
interface CartEntry {
  key: string;
  displayName: string;
  category: "protein" | "carb" | "produce";
  packages: number;
  purchaseLabel: string;
  pricePerUnit: number;  // post-state-multiplier
  totalCost: number;
  defPrice: number;      // raw (pre-multiplier) price — used for meal-matching
  defUnit: string;       // retail unit — used for meal-matching
  proteinG: number;      // total grams of protein in this purchase
  cals: number;          // total calories in this purchase
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatCookingNumber(n: number): string {
  if (n <= 0) return "0";
  const whole = Math.floor(n);
  const frac = n - whole;
  const FRACS: [number, string][] = [[1/4,"1/4"],[1/3,"1/3"],[1/2,"1/2"],[2/3,"2/3"],[3/4,"3/4"]];
  for (const [val, str] of FRACS) {
    if (Math.abs(frac - val) < 0.09) return whole > 0 ? `${whole} ${str}` : str;
  }
  if (frac < 0.09) return String(whole || 1);
  return n < 10 ? +n.toFixed(1) + "" : String(Math.round(n));
}

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
  return () => { s = Math.imul(1664525, s) + 1013904223; return (s >>> 0) / 0xffffffff; };
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
  vegetarian:  ["meat", "fish"],
  vegan:       ["meat", "dairy", "fish", "eggs"],
  gluten_free: ["gluten"],
  dairy_free:  ["dairy"],
  pescatarian: ["meat"],
  halal:       ["pork"],
  kosher:      ["pork"],
};

function isAllowed(meal: Meal, diets: string[]): boolean {
  if (diets.length === 0) return true;
  const excluded = new Set<DietaryFlag>();
  for (const diet of diets) for (const flag of EXCLUDED_FLAGS[diet] ?? []) excluded.add(flag);
  return !meal.contains.some((f) => excluded.has(f));
}

function hasAllergen(meal: Meal, allergies: string[]): boolean {
  if (allergies.length === 0) return false;
  const roots = allergies.map((a) => a.toLowerCase().trim().replace(/s$/i, ""));
  return meal.ingredients.some((ing) => roots.some((r) => ing.item.toLowerCase().includes(r)));
}

function scoreMeal(meal: Meal, goal: string): number {
  const pd = meal.protein / (meal.calories || 1);
  switch (goal) {
    case "muscle_gain":   return meal.protein * 3 + pd * 200;
    case "fat_loss":      return meal.protein * 3 - meal.calories * 0.3 + pd * 200;
    case "endurance":     return meal.carbs * 2 + meal.calories * 0.05;
    case "maintenance":   return meal.protein * 1.5 + meal.carbs * 0.5 - meal.fat * 0.2;
    case "general_health":return meal.protein * 2 - meal.fat * 0.5 + meal.carbs * 0.3;
    default:              return 0;
  }
}

function formatDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function categorizeIngredient(key: string): "protein" | "carb" | "produce" {
  if (/chicken|turkey|beef|tuna|salmon|shrimp|egg|tofu|yogurt|cottage|cheese|ham|bacon|lentil|chickpea|bean|protein powder/.test(key)) return "protein";
  if (/oat|rice|bread|pasta|tortilla|bagel|pita|quinoa|granola|potato|noodle/.test(key)) return "carb";
  return "produce";
}

// ── Nutrition & Dietary Lookup Tables ─────────────────────────────────────────

// Grams of protein per purchasable package (USDA approximations).
const PROTEIN_PER_PKG: Partial<Record<string, number>> = {
  "chicken breast": 140,          // 31 g/100 g × 453 g (1 lb)
  "grilled chicken breast": 140,
  "cooked chicken breast": 140,
  "ground turkey": 95,            // 21 g/100 g × 453 g
  "ground beef": 77,              // 17 g/100 g × 453 g (80/20)
  "sirloin steak": 123,           // 27 g/100 g × 453 g
  "salmon fillet": 34,            // ~170 g × 20 g/100 g
  "smoked salmon": 20,            // 4 oz × 5 g/oz
  "canned tuna": 29,              // 5 oz × 5.8 g/oz
  "tuna": 29,
  "medium shrimp": 104,           // 23 g/100 g × 453 g
  "shrimp": 104,
  "extra-firm tofu": 40,          // 10 g/100 g × 396 g (14 oz)
  "tofu": 40,
  "large eggs": 72,               // 6 g × 12 eggs
  "egg": 72,
  "large egg": 6,
  "egg whites": 48,               // typical 16 oz carton
  "plain greek yogurt": 68,       // 17 g/cup × 4 cups (32 oz)
  "greek yogurt": 68,
  "low-fat cottage cheese": 28,   // 14 g/half-cup × 2 cups (16 oz)
  "cottage cheese": 28,
  "lentils": 63,                  // 9 g/100 g cooked × ~700 g yield
  "chickpeas": 15,                // 3.5 g/100 g × 425 g (15 oz can)
  "black beans": 15,
  "protein powder": 750,          // 25 g/serving × 30 servings
  "deli turkey": 40,              // 5 g/oz × 8 oz
  "sliced turkey breast": 40,
};

// Dietary-flag membership for ingredients that could be purchased.
// Used to filter purchase candidates against the user's dietary restrictions.
const INGREDIENT_FLAGS: Record<string, DietaryFlag[]> = {
  "chicken breast":         ["meat"], "grilled chicken breast": ["meat"],
  "cooked chicken breast":  ["meat"], "ground beef":             ["meat"],
  "ground turkey":          ["meat"], "sirloin steak":           ["meat"],
  "deli turkey":            ["meat"], "sliced turkey breast":    ["meat"],
  "deli ham":               ["meat"], "ham":                     ["meat"],
  "bacon strips":           ["meat", "pork"], "bacon":           ["meat", "pork"],
  "salmon fillet":          ["fish"], "smoked salmon":           ["fish"],
  "canned tuna":            ["fish"], "tuna":                    ["fish"],
  "medium shrimp":          ["fish"], "shrimp":                  ["fish"],
  "large eggs":             ["eggs"], "egg":                     ["eggs"],
  "large egg":              ["eggs"], "egg whites":              ["eggs"],
  "plain greek yogurt":     ["dairy"], "greek yogurt":           ["dairy"],
  "milk":                   ["dairy"], "2% milk":                ["dairy"],
  "pasta":                  ["gluten"], "rolled oats":            ["gluten"],
  "whole wheat bread":      ["gluten"], "corn tortillas":         ["gluten"],
};

// ── Cart Builder ──────────────────────────────────────────────────────────────
// Builds the weekly grocery cart in three phases:
//   1. Proteins — hit the weekly protein target within the protein budget.
//   2. Carbs    — hit the remaining calorie gap with cheapest cal/$ staples.
//   3. Variety  — spend leftover budget on produce, bread, and extras that
//                 unlock the widest pool of eligible meals.

function buildTargetedCart(
  goal: string,
  diets: string[],
  allergies: string[],
  weeklyBudget: number,
  weeklyCalTarget: number,
  weeklyProteinTarget: number | null,
  stateMultiplier: number
): { entries: CartEntry[]; totalCals: number; totalProtein: number; totalCost: number } {
  const excludedFlags = new Set<DietaryFlag>();
  for (const diet of diets) for (const flag of EXCLUDED_FLAGS[diet] ?? []) excludedFlags.add(flag);
  const allergyRoots = allergies.map((a) => a.toLowerCase().trim().replace(/s$/i, ""));

  const isAllowedKey = (key: string) => {
    const flags = INGREDIENT_FLAGS[key] ?? [];
    if (flags.some((f) => excludedFlags.has(f))) return false;
    if (allergyRoots.some((r) => key.includes(r))) return false;
    return true;
  };

  const pluralUnit = (unit: string, n: number) =>
    n === 1 ? `1 ${unit}` : `${n} ${unit.replace(/^([a-z]+)/i, (w) =>
      w.endsWith("ch") || w.endsWith("x") ? w + "es" : w + "s")}`;

  const addEntry = (key: string, packages: number, pricePerUnit: number): CartEntry => {
    const def = PURCHASABLE_MAP[key]!;
    return {
      key,
      displayName: key.replace(/\b\w/g, (c) => c.toUpperCase()),
      category: categorizeIngredient(key),
      packages,
      purchaseLabel: pluralUnit(def.unit, packages),
      pricePerUnit,
      totalCost: +(pricePerUnit * packages).toFixed(2),
      defPrice: def.price,
      defUnit: def.unit,
      proteinG: (PROTEIN_PER_PKG[key] ?? 0) * packages,
      cals: (def.calsPerPkg ?? 0) * packages,
    };
  };

  const cart: CartEntry[] = [];
  const cartKeys = new Set<string>();
  const seenProduct = new Set<string>(); // dedup by "price-unit"
  let budgetLeft = weeklyBudget;
  let proteinAcquired = 0;
  let calsAcquired = 0;

  // ── Phase 1: Proteins ────────────────────────────────────────────────────────
  const proteinBudgetFraction = goal === "muscle_gain" ? 0.5 : 0.4;
  let proteinBudget = weeklyBudget * proteinBudgetFraction;

  // Protein supplements are variety items; exclude from the bulk-protein phase so
  // they don't consume the entire protein budget before whole-food proteins are bought.
  const PHASE1_EXCLUDED = new Set(["protein powder", "vanilla protein powder"]);

  // Build protein candidates sorted by protein-per-dollar descending.
  const proteinCandidates = Object.entries(PURCHASABLE_MAP)
    .filter(([key, def]) => PROTEIN_PER_PKG[key] && isAllowedKey(key) && !PHASE1_EXCLUDED.has(key))
    .map(([key, def]) => ({
      key,
      def,
      ppu: +(def.price * stateMultiplier).toFixed(2),
      proteinPerPkg: PROTEIN_PER_PKG[key]!,
      proteinPerDollar: PROTEIN_PER_PKG[key]! / (def.price * stateMultiplier),
    }))
    .filter((c) => c.ppu > 0)
    .sort((a, b) => b.proteinPerDollar - a.proteinPerDollar);

  for (const c of proteinCandidates) {
    if (proteinBudget <= 0) break;
    const dedupeId = `${c.def.price}-${c.def.unit}`;
    if (seenProduct.has(dedupeId)) continue;
    seenProduct.add(dedupeId);

    const remaining = weeklyProteinTarget ? weeklyProteinTarget - proteinAcquired : 0;
    const byProtein = weeklyProteinTarget ? Math.ceil(remaining / c.proteinPerPkg) : 1;
    const byBudget = Math.max(1, Math.floor(proteinBudget / c.ppu));
    const packages = Math.max(1, Math.min(byProtein, byBudget));

    const entry = addEntry(c.key, packages, c.ppu);
    cart.push(entry);
    cartKeys.add(c.key);
    seenProduct.add(dedupeId); // already added above, belt-and-suspenders

    const spent = entry.totalCost;
    proteinBudget -= spent;
    budgetLeft -= spent;
    proteinAcquired += entry.proteinG;
    calsAcquired += entry.cals;

    if (weeklyProteinTarget && proteinAcquired >= weeklyProteinTarget) break;
  }

  // ── Phase 2: Carbs for remaining calorie gap ─────────────────────────────────
  const carbSeenProduct = new Set(seenProduct);
  const carbCandidates = Object.entries(PURCHASABLE_MAP)
    .filter(([key, def]) =>
      def.calsPerPkg &&
      isAllowedKey(key) &&
      categorizeIngredient(key) === "carb" &&
      !cartKeys.has(key)
    )
    .map(([key, def]) => ({
      key,
      def,
      ppu: +(def.price * stateMultiplier).toFixed(2),
      calPerDollar: def.calsPerPkg! / (def.price * stateMultiplier),
    }))
    .filter((c) => c.ppu > 0)
    .sort((a, b) => b.calPerDollar - a.calPerDollar);

  for (const c of carbCandidates) {
    const calsStillNeeded = weeklyCalTarget - calsAcquired;
    if (calsStillNeeded <= 0 || budgetLeft <= 0) break;
    const dedupeId = `${c.def.price}-${c.def.unit}`;
    if (carbSeenProduct.has(dedupeId)) continue;
    carbSeenProduct.add(dedupeId);

    const byCal = Math.ceil(calsStillNeeded / c.def.calsPerPkg!);
    const byBudget = Math.max(1, Math.floor(budgetLeft / c.ppu));
    const packages = Math.max(1, Math.min(byCal, byBudget));

    const entry = addEntry(c.key, packages, c.ppu);
    cart.push(entry);
    cartKeys.add(c.key);
    budgetLeft -= entry.totalCost;
    calsAcquired += entry.cals;
  }

  // ── Phase 3: Variety (produce, bread, extras) ────────────────────────────────
  // Priority order: (a) additional protein variety not yet bought,
  // (b) essential produce that unlocks the most meals,
  // (c) carb variety, (d) extras.
  const varietyOrder = [
    // (a) additional protein variety
    "canned tuna", "salmon fillet", "egg whites", "extra-firm tofu",
    "lentils", "chickpeas", "black beans",
    // (b) produce essentials — buy 1 pkg each; onion/tomato need more
    "baby spinach", "broccoli florets", "banana", "bell pepper",
    "tomato", "onion",
    // (c) carb variety
    "whole wheat bread", "corn tortillas",
    // (d) extras
    "peanut butter", "plain greek yogurt", "low-fat cottage cheese",
  ];

  // buy onion and tomato in slightly larger quantities
  const qtyOverride: Record<string, number> = { tomato: 3, onion: 2 };

  for (const key of varietyOrder) {
    if (budgetLeft <= 0) break;
    if (cartKeys.has(key)) continue;
    if (!isAllowedKey(key)) continue;
    const def = PURCHASABLE_MAP[key];
    if (!def) continue;

    const dedupeId = `${def.price}-${def.unit}`;
    if (seenProduct.has(dedupeId)) continue;
    seenProduct.add(dedupeId);

    const ppu = +(def.price * stateMultiplier).toFixed(2);
    const wantPkgs = qtyOverride[key] ?? 1;
    const packages = Math.min(wantPkgs, Math.floor(budgetLeft / ppu));
    if (packages < 1) continue;

    const entry = addEntry(key, packages, ppu);
    cart.push(entry);
    cartKeys.add(key);
    budgetLeft -= entry.totalCost;
    calsAcquired += entry.cals;
    proteinAcquired += entry.proteinG;
  }

  const totalCost = +cart.reduce((s, e) => s + e.totalCost, 0).toFixed(2);
  return { entries: cart, totalCals: calsAcquired, totalProtein: proteinAcquired, totalCost };
}

// ── Meal Eligibility ──────────────────────────────────────────────────────────
// A meal is eligible if every non-pantry ingredient resolves to something in
// the purchased cart (matched by retail product: same price ≈ && same unit).

function mealEligibleFromCart(meal: Meal, cartEntries: CartEntry[]): boolean {
  for (const ing of meal.ingredients) {
    const key = normalizeKey(ing.item);
    if (isPantryStaple(key)) continue;
    const def = lookupPurchasable(key);
    if (!def) continue; // unknown ingredient — assume available
    const inCart = cartEntries.some(
      (e) => Math.abs(e.defPrice - def.price) < 0.01 && e.defUnit === def.unit
    );
    if (!inCart) return false;
  }
  return true;
}

// ── Pool Builder ──────────────────────────────────────────────────────────────
// The cart is the budget controller — no budget-tier or cal/$ filtering.
// A meal is eligible only if its non-pantry ingredients are in the cart.

interface PoolResult {
  pool: Meal[];
  usedRelaxedFallback: boolean;
  usedDietaryFallback: boolean; // true = budget exhausted; pool may have <7 meals and will cycle
  strictMealIds: Set<string>;
}

function buildPoolFromCart(
  type: Meal["type"],
  cartEntries: CartEntry[],
  diets: string[],
  allergies: string[],
  dislikedIds: Set<string>,
  goal: string,
  rng: () => number,
  budgetRef: { remaining: number },
  stateMultiplier: number
): PoolResult {
  const baseFilter = (m: Meal) =>
    m.type === type && isAllowed(m, diets) && !hasAllergen(m, allergies) && !dislikedIds.has(m.id);

  const isInCart = (price: number, unit: string) =>
    cartEntries.some((e) => Math.abs(e.defPrice - price) < 0.01 && e.defUnit === unit);

  // Strict: ALL non-pantry ingredients in cart.
  const strictPool = meals.filter((m) => baseFilter(m) && mealEligibleFromCart(m, cartEntries));
  const strictMealIds = new Set(strictPool.map((m) => m.id));
  let pool = strictPool;
  let usedRelaxedFallback = false;
  let usedDietaryFallback = false;

  // Relaxed fallback: ≥60% of mappable non-pantry ingredients in cart.
  if (pool.length < 7) {
    usedRelaxedFallback = true;
    console.warn(`[generatePlan] ${type} strict pool has only ${pool.length} meals; relaxing to 60% ingredient match`);
    pool = meals.filter((m) => {
      if (!baseFilter(m)) return false;
      const nonPantry = m.ingredients.filter((ing) => {
        const k = normalizeKey(ing.item);
        return !isPantryStaple(k) && lookupPurchasable(k) !== null;
      });
      if (nonPantry.length === 0) return true;
      const matched = nonPantry.filter((ing) => {
        const def = lookupPurchasable(normalizeKey(ing.item));
        if (!def) return true;
        return isInCart(def.price, def.unit);
      });
      return matched.length / nonPantry.length >= 0.6;
    });
  }

  // Budget-expansion fallback: buy missing ingredients for the best-scoring meals.
  // Never shows a meal whose ingredients weren't actually purchased.
  if (pool.length < 7) {
    const poolIds = new Set(pool.map((m) => m.id));
    const candidates = meals
      .filter((m) => baseFilter(m) && !poolIds.has(m.id))
      .sort((a, b) => scoreMeal(b, goal) - scoreMeal(a, goal));

    for (const meal of candidates) {
      if (pool.length >= 7) break;

      // Collect missing mappable non-pantry ingredients not yet in cartEntries.
      const missing: Array<{ key: string; price: number; unit: string }> = [];
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key)) continue;
        const def = lookupPurchasable(key);
        if (!def) continue;
        if (
          !isInCart(def.price, def.unit) &&
          !missing.some((m) => Math.abs(m.price - def.price) < 0.01 && m.unit === def.unit)
        ) {
          missing.push({ key, price: def.price, unit: def.unit });
        }
      }

      const expandCost = missing.reduce((s, { price }) => s + +(price * stateMultiplier).toFixed(2), 0);
      if (expandCost > budgetRef.remaining) continue;

      for (const { key, price, unit } of missing) {
        const def = PURCHASABLE_MAP[key] ?? lookupPurchasable(key)!;
        const ppu = +(price * stateMultiplier).toFixed(2);
        budgetRef.remaining = +(budgetRef.remaining - ppu).toFixed(2);
        cartEntries.push({
          key,
          displayName: key.replace(/\b\w/g, (c) => c.toUpperCase()),
          category: categorizeIngredient(key),
          packages: 1,
          purchaseLabel: `1 ${unit}`,
          pricePerUnit: ppu,
          totalCost: ppu,
          defPrice: price,
          defUnit: unit,
          proteinG: PROTEIN_PER_PKG[key] ?? 0,
          cals: def.calsPerPkg ?? 0,
        });
      }
      pool.push(meal);
    }

    if (pool.length < 7) {
      // Budget exhausted before reaching 7 meals — pool will cycle through what was bought.
      usedDietaryFallback = true;
      console.warn(`[generatePlan] ${type} budget exhausted; pool has ${pool.length} meals — will cycle`);
    }

    // Absolute safety net: if dietary restrictions or allergies leave zero eligible meals.
    if (pool.length === 0) {
      pool = meals.filter(baseFilter);
    }
  }

  const sorted = [...pool].sort((a, b) => scoreMeal(b, goal) - scoreMeal(a, goal));
  const shuffled = shuffle(sorted, rng);
  console.log(`[generatePlan] ${type} pool: ${shuffled.length} meals (from cart)`);
  return { pool: shuffled, usedRelaxedFallback, usedDietaryFallback, strictMealIds };
}

// ── Grocery List Builder (kept for internal use) ───────────────────────────────
// Aggregates all ingredients from the week 1 meal template. Used as a utility
// function; the displayed weeklyCart comes from buildTargetedCart instead.

function buildGroceryFromMeals(week1: DayMeals[], stateMultiplier: number): WeeklyCartSummary {
  const ingredientMap = new Map<string, { amounts: string[]; rawKey: string }>();
  for (const day of week1) {
    for (const meal of [day.breakfast, day.lunch, day.dinner, day.snack]) {
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key)) continue;
        if (!ingredientMap.has(key)) ingredientMap.set(key, { amounts: [], rawKey: ing.item });
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
  return { items, totalCost: +items.reduce((s, i) => s + i.totalCost, 0).toFixed(2) };
}

// ── Pool Index Tracker ────────────────────────────────────────────────────────

interface UsedTracker { breakfast: number; lunch: number; dinner: number; snack: number; }
type MealKey = "breakfast" | "lunch" | "dinner" | "snack";
function freshUsedTracker(): UsedTracker { return { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }; }

// ── Calorie Balancer ──────────────────────────────────────────────────────────

function balanceDailyCalories(week: DayMeals[]): void {
  for (let iter = 0; iter < 20; iter++) {
    let maxIdx = 0, minIdx = 0;
    for (let i = 1; i < week.length; i++) {
      if (week[i].dailyCalories > week[maxIdx].dailyCalories) maxIdx = i;
      if (week[i].dailyCalories < week[minIdx].dailyCalories) minIdx = i;
    }
    if (week[maxIdx].dailyCalories - week[minIdx].dailyCalories < 200) break;
    let bestKey: MealKey | null = null, bestReduction = 0;
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
      day.dailyCost     = +(day.breakfast.cost + day.lunch.cost + day.dinner.cost + day.snack.cost).toFixed(2);
    }
  }
}

// ── Day Meal Selector ─────────────────────────────────────────────────────────

function selectDayMeals(
  bPool: Meal[], lPool: Meal[], dPool: Meal[], sPool: Meal[],
  usedTracker: UsedTracker, dayLabel: string
): { breakfast: Meal; lunch: Meal; dinner: Meal; snack: Meal } {
  function pick(pool: Meal[], slot: keyof UsedTracker): Meal {
    const idx = usedTracker[slot] % pool.length;
    const meal = pool[idx];
    console.log(`[generatePlan] ${dayLabel} ${slot}: index=${idx}/${pool.length} → "${meal.name}" (id=${meal.id})`);
    usedTracker[slot]++;
    return meal;
  }
  return { breakfast: pick(bPool,"breakfast"), lunch: pick(lPool,"lunch"),
           dinner: pick(dPool,"dinner"), snack: pick(sPool,"snack") };
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
  allergies: string[] = [],
  weightLbs?: number
): MealPlan {
  const stateMultiplier = STATE_MULTIPLIERS[stateCode] ?? 1.0;
  const numWeeks = Math.ceil(totalDays / 7);
  const dislikedSet = new Set(dislikedIds);
  const perPersonBudget = budget / Math.max(1, numberOfPeople);

  // ── Step 1: Calculate weekly targets ─────────────────────────────────────────
  const dailyCals = calorieTarget ?? 2000;
  const weeklyCalTarget = dailyCals * 7;

  // Daily protein target (g) derived from body weight and goal.
  const PROTEIN_RATE: Record<string, number> = {
    muscle_gain: 0.85, endurance: 0.65, fat_loss: 0.5,
    maintenance: 0.6, general_health: 0.6,
  };
  const dailyProteinTarget = weightLbs
    ? Math.round((PROTEIN_RATE[goal] ?? 0.6) * weightLbs)
    : null;
  const weeklyProteinTarget = dailyProteinTarget ? dailyProteinTarget * 7 : null;

  console.log(
    `[generatePlan] targets — cal: ${dailyCals}/day (${weeklyCalTarget}/wk)` +
    (dailyProteinTarget ? ` | protein: ${dailyProteinTarget}g/day (${weeklyProteinTarget}g/wk)` : "")
  );

  // ── Step 2: Build the grocery cart ───────────────────────────────────────────
  // Phase 1 → proteins, Phase 2 → carbs, Phase 3 → variety.
  const { entries: cartEntries, totalCals: cartCals, totalProtein: cartProtein, totalCost: cartCost } =
    buildTargetedCart(goal, diets, allergies, perPersonBudget, weeklyCalTarget, weeklyProteinTarget, stateMultiplier);

  console.log(
    `[generatePlan] cart built — cost: $${cartCost.toFixed(2)} / $${perPersonBudget}` +
    ` | cals: ${cartCals} (target ${weeklyCalTarget})` +
    ` | protein: ${cartProtein}g (target ${weeklyProteinTarget ?? "—"}g)`
  );

  // ── Step 3: Validate targets & generate budget cap message ────────────────────
  const calsMet     = cartCals >= weeklyCalTarget * 0.90;
  const proteinMet  = weeklyProteinTarget ? cartProtein >= weeklyProteinTarget * 0.85 : true;

  let budgetCapMessage: string | undefined;
  if (!calsMet || !proteinMet) {
    // Estimate the minimum budget that would hit both targets.
    const bestCalPerDollar = Math.max(
      ...Object.entries(PURCHASABLE_MAP)
        .filter(([, d]) => d.calsPerPkg)
        .map(([, d]) => d.calsPerPkg! / (d.price * stateMultiplier))
    );
    const bestProteinPerDollar = weeklyProteinTarget
      ? Math.max(
          ...Object.entries(PURCHASABLE_MAP)
            .filter(([k]) => PROTEIN_PER_PKG[k])
            .map(([k, d]) => PROTEIN_PER_PKG[k]! / (d.price * stateMultiplier))
        )
      : 0;
    const minProteinCost  = weeklyProteinTarget ? weeklyProteinTarget / bestProteinPerDollar : 0;
    const minRemainingCal = Math.max(0, weeklyCalTarget - (weeklyProteinTarget ? weeklyProteinTarget * 4 : 0));
    const minCalCost      = minRemainingCal / bestCalPerDollar;
    const minBudget       = Math.ceil((minProteinCost + minCalCost) * 1.15); // 15% buffer for variety

    const calStr = `${Math.round(cartCals / 7).toLocaleString()} cal`;
    const protStr = dailyProteinTarget ? ` / ${Math.round(cartProtein / 7)}g protein` : "";
    const tgtStr = `${dailyCals.toLocaleString()} cal${dailyProteinTarget ? ` / ${dailyProteinTarget}g protein` : ""}`;
    budgetCapMessage =
      `Your $${perPersonBudget}/week budget provides approximately ${calStr}${protStr} per day ` +
      `toward your ${tgtStr} goal. ` +
      `Increase your budget to $${minBudget}/week to fully hit your targets.`;
  }

  // ── Step 4: Seed the RNG ──────────────────────────────────────────────────────
  const goalIndex = ["muscle_gain","fat_loss","maintenance","endurance","general_health"].indexOf(goal) + 1;
  const dietHash  = diets.slice().sort().join(",").split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
  const stateIdx  = stateCode.length >= 2 ? stateCode.charCodeAt(0) + stateCode.charCodeAt(1) : 0;
  const seed      = (Math.round(budget * 100) + goalIndex * 1000 + dietHash + stateIdx + planSalt) >>> 0;
  const rng       = seededRng(seed);

  // ── Step 5: Build meal pools from the purchased cart ─────────────────────────
  // budgetRef is shared across all four pool-builder calls so that ingredients
  // bought to expand one slot's pool are immediately visible to later slots.
  const budgetRef = { remaining: +(perPersonBudget - cartCost).toFixed(2) };
  const bResult = buildPoolFromCart("breakfast", cartEntries, diets, allergies, dislikedSet, goal, rng, budgetRef, stateMultiplier);
  const lResult = buildPoolFromCart("lunch",     cartEntries, diets, allergies, dislikedSet, goal, rng, budgetRef, stateMultiplier);
  const dResult = buildPoolFromCart("dinner",    cartEntries, diets, allergies, dislikedSet, goal, rng, budgetRef, stateMultiplier);
  const sResult = buildPoolFromCart("snack",     cartEntries, diets, allergies, dislikedSet, goal, rng, budgetRef, stateMultiplier);
  const bPool = bResult.pool;
  const lPool = lResult.pool;
  const dPool = dResult.pool;
  const sPool = sResult.pool;

  if (bPool.length < 7 || lPool.length < 7 || dPool.length < 7 || sPool.length < 7) {
    console.warn(`[generatePlan] one or more pools have fewer than 7 meals — repeats possible`);
  }

  // ── Step 6: Assign 7 days of meals ───────────────────────────────────────────
  const week1Days: DayMeals[] = [];
  const usedTracker = freshUsedTracker();
  const week1Length = Math.min(totalDays, 7);

  for (let i = 0; i < week1Length; i++) {
    const { breakfast, lunch, dinner, snack } = selectDayMeals(bPool, lPool, dPool, sPool, usedTracker, DAY_NAMES[i % 7]);
    week1Days.push({
      day: DAY_NAMES[i % 7],
      date: formatDate(i),
      weekIndex: 0,
      dayIndex: i,
      breakfast, lunch, dinner, snack,
      dailyCalories: breakfast.calories + lunch.calories + dinner.calories + snack.calories,
      dailyProtein:  breakfast.protein  + lunch.protein  + dinner.protein  + snack.protein,
      dailyCarbs:    breakfast.carbs    + lunch.carbs    + dinner.carbs    + snack.carbs,
      dailyFat:      breakfast.fat      + lunch.fat      + dinner.fat      + snack.fat,
      dailyCost:     +(breakfast.cost   + lunch.cost     + dinner.cost     + snack.cost).toFixed(2),
    });
  }

  // ── Step 7: Balance calorie distribution across days ─────────────────────────
  balanceDailyCalories(week1Days);

  // ── Step 8: Scale portions to hit the daily calorie target ────────────────────
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

  if (portionCapped && budgetCapMessage === undefined && calorieTarget) {
    const avgCal = Math.round(week1Days.reduce((s, d) => s + d.dailyCalories, 0) / week1Days.length);
    if (avgCal < Math.round(calorieTarget * 0.95)) {
      budgetCapMessage =
        `Portions capped at ${calorieTarget > avgCal ? "2×" : "0.5×"} — plan averages ` +
        `${avgCal.toLocaleString()} cal/day vs your ${calorieTarget.toLocaleString()} cal goal. ` +
        `Consider a higher budget or fewer dietary restrictions.`;
    }
  }

  // ── Cart Augmentation: add missing ingredients for relaxed-fallback meals ─────
  // For any selected meal that only passed the 60% relaxed check (not strict),
  // push its still-missing purchasable ingredients into cartEntries so the
  // grocery list reflects everything the user actually needs to cook the plan.
  const poolResultBySlot: Record<MealKey, PoolResult> = {
    breakfast: bResult, lunch: lResult, dinner: dResult, snack: sResult,
  };
  const addedToCart = new Set<string>();
  let cartFallbackUsed = false;

  for (const day of week1Days) {
    for (const [slot, meal] of [
      ["breakfast", day.breakfast], ["lunch", day.lunch],
      ["dinner", day.dinner],       ["snack", day.snack],
    ] as [MealKey, Meal][]) {
      const res = poolResultBySlot[slot];
      if (!res.usedRelaxedFallback || res.usedDietaryFallback) continue;
      if (res.strictMealIds.has(meal.id)) continue;
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key) || addedToCart.has(key)) continue;
        const def = lookupPurchasable(key);
        if (!def) continue;
        const inCart = cartEntries.some((e) => Math.abs(e.defPrice - def.price) < 0.01 && e.defUnit === def.unit);
        if (inCart) continue;
        addedToCart.add(key);
        const ppu = +(def.price * stateMultiplier).toFixed(2);
        cartEntries.push({
          key,
          displayName: key.replace(/\b\w/g, (c) => c.toUpperCase()),
          category: categorizeIngredient(key),
          packages: 1,
          purchaseLabel: `1 ${def.unit}`,
          pricePerUnit: ppu,
          totalCost: ppu,
          defPrice: def.price,
          defUnit: def.unit,
          proteinG: PROTEIN_PER_PKG[key] ?? 0,
          cals: def.calsPerPkg ?? 0,
        });
      }
    }
  }

  // Budget exhausted before reaching 7 meals in one or more slots — those slots will
  // cycle through the smaller pool. All meals shown were actually purchased.
  if ([bResult, lResult, dResult, sResult].some((r) => r.usedDietaryFallback)) {
    cartFallbackUsed = true;
    const fallbackMsg =
      "Budget exhausted before building a full 7-meal variety — some meal slots will repeat. Increase your weekly budget for more variety.";
    budgetCapMessage = budgetCapMessage ? `${budgetCapMessage} ${fallbackMsg}` : fallbackMsg;
  }

  // ── Step 9: Expand to full plan length ───────────────────────────────────────
  const days: DayMeals[] = Array.from({ length: totalDays }, (_, i) => {
    if (i < week1Days.length) return week1Days[i];
    return { ...week1Days[i % 7], day: DAY_NAMES[i % 7], date: formatDate(i), dayIndex: i, weekIndex: Math.floor(i / 7) };
  });
  const weeks: DayMeals[][] = Array.from({ length: numWeeks }, (_, w) => days.slice(w * 7, w * 7 + 7));

  const avgDailyCalories = Math.round(week1Days.reduce((s, d) => s + d.dailyCalories, 0) / week1Days.length);
  const avgDailyProtein  = Math.round(week1Days.reduce((s, d) => s + d.dailyProtein,  0) / week1Days.length);

  // ── Step 10: Return cart from Step 2 as weeklyCart (augmented if fallback fired) ─
  const weeklyCart: WeeklyCartSummary = {
    items: cartEntries.map(({ key, displayName, category, packages, purchaseLabel, pricePerUnit, totalCost }) =>
      ({ key, displayName, category, packages, purchaseLabel, pricePerUnit, totalCost })),
    totalCost: +cartEntries.reduce((s, e) => s + e.totalCost, 0).toFixed(2),
  };
  const weeklyEstimatedCost = weeklyCart.totalCost;
  const totalPlanCost = +(weeklyEstimatedCost * numWeeks).toFixed(2);

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
    proteinTarget: dailyProteinTarget ?? undefined,
    budgetCapMessage,
    cartFallbackUsed: cartFallbackUsed || undefined,
    weeklyCart,
  };
}
