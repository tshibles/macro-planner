import { meals, Meal, DietaryFlag, Ingredient } from "@/app/data/meals";
import { STATE_MULTIPLIERS } from "@/app/data/stateMultipliers";
import { normalizeKey } from "@/app/lib/normalizeIngredient";
import { isPantryStaple, computePurchasable, parseAmountInBase, PURCHASABLE_MAP, lookupPurchasable, PurchasableUnitDef } from "@/app/data/purchasableUnits";

export interface CartItem {
  key: string;
  displayName: string;
  category: "protein" | "carb" | "produce";
  packages: number;
  purchaseLabel: string;
  pricePerUnit: number;
  totalCost: number;
}

// Where a day's slot meal comes from in the meal-prep model: batch-cooked at
// one of the week's two prep sessions, or made fresh the same day.
export type SlotSource = "sunday-prep" | "wednesday-prep" | "fresh";

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
  // Per-slot provenance — derived after final meal assignment so swaps that
  // break a batch group demote that day's slot back to "fresh".
  slotSources: Record<"breakfast" | "lunch" | "dinner" | "snack", SlotSource>;
}

export interface WeeklyCartSummary {
  items: CartItem[];
  totalCost: number;
}

// ── Meal-Prep Sessions ────────────────────────────────────────────────────────
// Each week has two prep sessions: Sunday prep batch-cooks for Monday–Wednesday
// and Wednesday prep batch-cooks for Thursday–Saturday. Sunday itself is a
// lighter, all-fresh day. A batched recipe intentionally repeats across the
// days it covers — that's the meal-prep model, not a variety bug.

export interface PrepRecipe {
  // The per-serving meal exactly as eaten (portion-scaled).
  meal: Meal;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  // Portions to cook at this session = days this batch covers in the plan.
  servingsToCook: number;
  // The recipe's natural batch yield (from the meal library).
  batchServings: number;
  coveredDayIndexes: number[];
  coveredDays: string[];
  storageInstructions: string;
  reheatInstructions: string;
  // Total ingredients for the whole batch (per-serving amounts × servings),
  // so the prep-day cook buys/cooks one batch — not one set per covered day.
  batchIngredients: Ingredient[];
}

export interface PrepSession {
  weekIndex: number;
  sessionDay: "Sunday" | "Wednesday";
  title: string;       // e.g. "Sunday Prep"
  coversLabel: string; // e.g. "Covers Monday – Wednesday"
  recipes: PrepRecipe[];
}

// A user-initiated meal replacement, applied on top of the deterministic
// selection. Only valid for the plan salt it was created against.
export interface MealSwap {
  dayIndex: number;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  mealId: string;
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
  // One cart per week, built from the week's FINAL portion-scaled meals
  // (batch ingredients counted once per prep session). weeklyCarts[w] pairs
  // with weeks[w].
  weeklyCarts: WeeklyCartSummary[];
  // Per-week prep sessions (usually Sunday + Wednesday). prepSessions[w]
  // pairs with weeks[w]; empty sessions are omitted.
  prepSessions: PrepSession[][];
  // Portion scale each week actually applied so its real grocery cost fits the
  // weekly budget (1 = full portions). Pairs with weeks[w].
  weeklyPortionScale?: number[];
  // Each week's grocery cost at full (scale = 1) portions — the true price of
  // the calorie target, used for honest budget messaging.
  weeklyFullCost?: number[];
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

// Fraction of a meal's calories that come from protein (scale-invariant).
function proteinCalRatio(meal: Meal): number {
  return (meal.protein * 4) / (meal.calories || 1);
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
  if (/chicken|turkey|beef|steak|sirloin|tuna|salmon|shrimp|egg|tofu|yogurt|cottage|cheese|ham|bacon|lentil|chickpea|bean|protein powder/.test(key)) return "protein";
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
// Builds the weekly grocery cart in four phases:
//   1. Proteins      — hit the weekly protein target within the protein budget.
//   2. Carbs         — hit the remaining calorie gap with cheapest cal/$ staples.
//   3. Meal variety  — buy the missing ingredients of the best-scoring meals,
//                      round-robin across slots, until every slot has 7 cookable
//                      meals or the budget runs out (expandCartForMealVariety).
//   4. Extras        — spend leftover budget on breadth staples (spendRemainingOnVariety).

const productId = (price: number, unit: string) => `${price}-${unit}`;

function entryInCart(cartEntries: CartEntry[], price: number, unit: string): boolean {
  return cartEntries.some((e) => Math.abs(e.defPrice - price) < 0.01 && e.defUnit === unit);
}

function makeKeyFilter(diets: string[], allergies: string[]): (key: string) => boolean {
  const excludedFlags = new Set<DietaryFlag>();
  for (const diet of diets) for (const flag of EXCLUDED_FLAGS[diet] ?? []) excludedFlags.add(flag);
  const allergyRoots = allergies.map((a) => a.toLowerCase().trim().replace(/s$/i, ""));
  return (key: string) => {
    const flags = INGREDIENT_FLAGS[key] ?? [];
    if (flags.some((f) => excludedFlags.has(f))) return false;
    if (allergyRoots.some((r) => key.includes(r))) return false;
    return true;
  };
}

function pluralUnit(unit: string, n: number): string {
  return n === 1 ? `1 ${unit}` : `${n} ${unit.replace(/^([a-z]+)/i, (w) =>
    w.endsWith("ch") || w.endsWith("x") ? w + "es" : w + "s")}`;
}

function makeCartEntry(key: string, def: PurchasableUnitDef, packages: number, stateMultiplier: number): CartEntry {
  const ppu = +(def.price * stateMultiplier).toFixed(2);
  return {
    key,
    displayName: key.replace(/\b\w/g, (c) => c.toUpperCase()),
    category: categorizeIngredient(key),
    packages,
    purchaseLabel: pluralUnit(def.unit, packages),
    pricePerUnit: ppu,
    totalCost: +(ppu * packages).toFixed(2),
    defPrice: def.price,
    defUnit: def.unit,
    proteinG: (PROTEIN_PER_PKG[key] ?? 0) * packages,
    cals: (def.calsPerPkg ?? 0) * packages,
  };
}

function buildTargetedCart(
  goal: string,
  diets: string[],
  allergies: string[],
  weeklyBudget: number,
  weeklyCalTarget: number,
  weeklyProteinTarget: number | null,
  stateMultiplier: number,
  existing: CartEntry[] = [] // pre-purchased entries (meal-aware variety pass) to top up around
): { entries: CartEntry[]; budgetLeft: number } {
  const isAllowedKey = makeKeyFilter(diets, allergies);

  const cart: CartEntry[] = [...existing];
  const cartKeys = new Set<string>(existing.map((e) => e.key));
  const seenProduct = new Set<string>(existing.map((e) => productId(e.defPrice, e.defUnit))); // dedup by "price-unit"
  let budgetLeft = +(weeklyBudget - existing.reduce((s, e) => s + e.totalCost, 0)).toFixed(2);
  let proteinAcquired = existing.reduce((s, e) => s + e.proteinG, 0);
  let calsAcquired = existing.reduce((s, e) => s + e.cals, 0);

  // ── Phase 1: Proteins ────────────────────────────────────────────────────────
  // When the user gave no body weight, derive an implicit goal from the calorie
  // target (~25% of calories from protein) so this phase still terminates at a
  // sane amount instead of buying one package of every protein in the catalog.
  const weeklyProteinGoal = weeklyProteinTarget ?? Math.round((weeklyCalTarget * 0.25) / 4);
  const proteinBudgetFraction = goal === "muscle_gain" ? 0.5 : 0.4;
  let proteinBudget = Math.min(weeklyBudget * proteinBudgetFraction, budgetLeft);

  // Protein supplements are variety items; exclude from the bulk-protein phase so
  // they don't consume the entire protein budget before whole-food proteins are bought.
  const PHASE1_EXCLUDED = new Set(["protein powder", "vanilla protein powder"]);

  // Build protein candidates sorted by protein-per-dollar descending.
  const proteinCandidates = Object.entries(PURCHASABLE_MAP)
    .filter(([key]) => PROTEIN_PER_PKG[key] && isAllowedKey(key) && !PHASE1_EXCLUDED.has(key))
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
    if (proteinBudget <= 0 || proteinAcquired >= weeklyProteinGoal) break;
    const dedupeId = productId(c.def.price, c.def.unit);
    if (seenProduct.has(dedupeId)) continue;
    seenProduct.add(dedupeId);

    const byProtein = Math.ceil((weeklyProteinGoal - proteinAcquired) / c.proteinPerPkg);
    const byBudget = Math.floor(proteinBudget / c.ppu);
    if (byBudget < 1) continue; // skip proteins we can't afford (keeps budget tight)
    const packages = Math.min(byProtein, byBudget);

    const entry = makeCartEntry(c.key, c.def, packages, stateMultiplier);
    cart.push(entry);
    cartKeys.add(c.key);

    proteinBudget -= entry.totalCost;
    budgetLeft -= entry.totalCost;
    proteinAcquired += entry.proteinG;
    calsAcquired += entry.cals;
  }

  // ── Phase 2: Carbs for remaining calorie gap ─────────────────────────────────
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
    const dedupeId = productId(c.def.price, c.def.unit);
    if (seenProduct.has(dedupeId)) continue;
    seenProduct.add(dedupeId);

    const byCal = Math.ceil(calsStillNeeded / c.def.calsPerPkg!);
    const byBudget = Math.floor(budgetLeft / c.ppu);
    if (byBudget < 1) break; // can't afford even one package — stop buying carbs
    const packages = Math.min(byCal, byBudget, 4); // cap at 4 per carb; loop continues to next

    const entry = makeCartEntry(c.key, c.def, packages, stateMultiplier);
    cart.push(entry);
    cartKeys.add(c.key);
    budgetLeft -= entry.totalCost;
    calsAcquired += entry.cals;
  }

  return { entries: cart, budgetLeft: +budgetLeft.toFixed(2) };
}

// ── Phase 3: Meal-Aware Variety Expansion ─────────────────────────────────────
// Buys the missing ingredients of concrete meals (best goal-score first), one
// meal per slot per round-robin pass, until every slot has at least 7 cookable
// meals or the budget runs out. Because purchases happen BEFORE pools are
// built, every meal shown is fully purchasable — no post-hoc cart patching.

const MEAL_SLOTS: Meal["type"][] = ["breakfast", "lunch", "dinner", "snack"];

// Weekly per-person budget at which tier-3 premium meals (salmon, steak,
// shrimp) become worth provisioning for. Matches the catalog's tier design.
const PREMIUM_TIER_MIN_BUDGET = 100;

function collectMissingProducts(meal: Meal, cartEntries: CartEntry[]): Array<{ key: string; def: PurchasableUnitDef }> {
  const missing: Array<{ key: string; def: PurchasableUnitDef }> = [];
  for (const ing of meal.ingredients) {
    const key = normalizeKey(ing.item);
    if (isPantryStaple(key)) continue;
    const def = lookupPurchasable(key);
    if (!def) continue; // unknown ingredient — assume available
    if (
      !entryInCart(cartEntries, def.price, def.unit) &&
      !missing.some((m) => Math.abs(m.def.price - def.price) < 0.01 && m.def.unit === def.unit)
    ) {
      missing.push({ key, def });
    }
  }
  return missing;
}

function expandCartForMealVariety(
  cartEntries: CartEntry[],
  budgetRef: { remaining: number },
  weeklyBudget: number,
  diets: string[],
  allergies: string[],
  dislikedIds: Set<string>,
  goal: string,
  stateMultiplier: number,
  targetProteinRatio: number | null = null
): void {
  // One expensive meal (e.g. one needing a $26 protein-powder tub) must not eat
  // the whole variety budget — skip meals whose missing ingredients cost more.
  const perMealCap = Math.max(8, weeklyBudget * 0.15);
  // Tier-3 premium meals (salmon, steak, shrimp) only join the variety
  // expansion when the budget can carry them. Below that, their ingredient
  // unlocks ($8-9/lb proteins) eat the variety budget and starve the
  // cheap-staple pools that tight budgets depend on to hit calorie targets.
  const tierAllowed = (m: Meal) => m.budgetTier < 3 || weeklyBudget >= PREMIUM_TIER_MIN_BUDGET;
  const baseFilter = (m: Meal, type: Meal["type"]) =>
    m.type === type && isAllowed(m, diets) && !hasAllergen(m, allergies) && !dislikedIds.has(m.id) && tierAllowed(m);

  // With a protein target, spend the variety budget where it buys the most
  // cookable meals: cheapest missing-ingredient set first, so shared staples
  // (peanut butter, bread, bananas) cascade across many meals. Ties break
  // toward meals whose protein density doesn't exceed the target — portions
  // are scaled to the calorie target, so a lighter-than-target meal can be
  // paired upward against the catalog's abundant dense meals, while a slate
  // that's uniformly denser than the target always over-delivers protein.
  // Without a protein target, keep the goal-based score.
  const densityPenalty = (m: Meal) => {
    const dev = proteinCalRatio(m) - (targetProteinRatio as number);
    return dev > 0 ? dev : -dev * 0.25;
  };
  const unlockCost = (m: Meal) =>
    collectMissingProducts(m, cartEntries)
      .reduce((s, { def }) => s + +(def.price * stateMultiplier).toFixed(2), 0);
  const rank = (m: Meal) =>
    targetProteinRatio !== null
      ? -(unlockCost(m) / 10 + densityPenalty(m))
      : scoreMeal(m, goal);

  // Light-coverage pass: every slot needs a few of its lightest meals
  // cookable, or no day can be composed near the target ratio — the cheapest
  // unlocks alone tend to be the protein-dense meals that piggyback on the
  // Phase-1 protein purchases. Runs before the counts below so the unlocked
  // meals are counted once.
  if (targetProteinRatio !== null) {
    // Pool the 5 lightest meals of every slot, then repeatedly buy the
    // cheapest missing-ingredient set among them (up to 3 light meals per
    // slot). Cheapest-first exploits shared staples — one peanut-butter
    // purchase makes several other light meals free — so the variety budget
    // covers far more than a slot-by-slot pass would.
    const lightBySlot = new Map<Meal["type"], Meal[]>(
      MEAL_SLOTS.map((type) => [
        type,
        meals
          .filter((m) => baseFilter(m, type))
          .sort((a, b) => proteinCalRatio(a) - proteinCalRatio(b))
          .slice(0, 5),
      ])
    );
    const lightCount = (type: Meal["type"]) =>
      lightBySlot.get(type)!.filter((m) => mealEligibleFromCart(m, cartEntries)).length;
    while (true) {
      let cheapest: { meal: Meal; missing: Array<{ key: string; def: PurchasableUnitDef }>; cost: number } | null = null;
      for (const type of MEAL_SLOTS) {
        if (lightCount(type) >= 3) continue;
        for (const meal of lightBySlot.get(type)!) {
          if (mealEligibleFromCart(meal, cartEntries)) continue;
          const missing = collectMissingProducts(meal, cartEntries);
          const cost = +missing
            .reduce((s, { def }) => s + +(def.price * stateMultiplier).toFixed(2), 0)
            .toFixed(2);
          if (cost > perMealCap || cost > budgetRef.remaining) continue;
          if (!cheapest || cost < cheapest.cost) cheapest = { meal, missing, cost };
        }
      }
      if (!cheapest) break;
      for (const { key, def } of cheapest.missing) {
        cartEntries.push(makeCartEntry(key, def, 1, stateMultiplier));
      }
      budgetRef.remaining = +(budgetRef.remaining - cheapest.cost).toFixed(2);
      console.log(
        `[generatePlan] light-coverage: ${cheapest.meal.type} "${cheapest.meal.id}" unlocked for $${cheapest.cost} — $${budgetRef.remaining} left`
      );
    }
  }

  const slots = MEAL_SLOTS.map((type) => ({
    type,
    count: meals.filter((m) => baseFilter(m, type) && mealEligibleFromCart(m, cartEntries)).length,
    candidates: meals
      .filter((m) => baseFilter(m, type) && !mealEligibleFromCart(m, cartEntries))
      .sort((a, b) => rank(b) - rank(a)),
    idx: 0,
  }));

  let progress = true;
  while (progress) {
    progress = false;
    for (const slot of slots) {
      if (slot.count >= 7) continue;
      while (slot.idx < slot.candidates.length) {
        const meal = slot.candidates[slot.idx++];
        // A purchase made for another slot may have already unlocked this meal.
        if (mealEligibleFromCart(meal, cartEntries)) {
          slot.count++;
          progress = true;
          break;
        }
        const missing = collectMissingProducts(meal, cartEntries);
        const cost = +missing
          .reduce((s, { def }) => s + +(def.price * stateMultiplier).toFixed(2), 0)
          .toFixed(2);
        if (cost > perMealCap || cost > budgetRef.remaining) continue;
        for (const { key, def } of missing) {
          cartEntries.push(makeCartEntry(key, def, 1, stateMultiplier));
        }
        budgetRef.remaining = +(budgetRef.remaining - cost).toFixed(2);
        slot.count++;
        progress = true;
        break;
      }
    }
  }

  for (const slot of slots) {
    if (slot.count < 7) {
      console.warn(`[generatePlan] ${slot.type}: budget exhausted at ${slot.count} cookable meals — will cycle`);
    }
  }

  // Batch-coverage pass: the meal-prep model batch-cooks lunches/dinners (and
  // a snack when possible) at the week's two prep sessions. Make sure each of
  // those slots has batch-cookable recipes, or a prep segment would fall back
  // to repeating a fresh meal. Cheapest missing-ingredient set first.
  const BATCH_MINIMUMS: Array<{ type: Meal["type"]; min: number }> = [
    { type: "lunch", min: 5 }, { type: "dinner", min: 5 }, { type: "snack", min: 2 },
  ];
  for (const { type, min } of BATCH_MINIMUMS) {
    const batchCookable = () =>
      meals.filter((m) => baseFilter(m, type) && m.prepType === "batch" && mealEligibleFromCart(m, cartEntries)).length;
    while (batchCookable() < min) {
      let cheapest: { meal: Meal; missing: Array<{ key: string; def: PurchasableUnitDef }>; cost: number } | null = null;
      for (const meal of meals) {
        if (!baseFilter(meal, type) || meal.prepType !== "batch" || mealEligibleFromCart(meal, cartEntries)) continue;
        const missing = collectMissingProducts(meal, cartEntries);
        const cost = +missing
          .reduce((s, { def }) => s + +(def.price * stateMultiplier).toFixed(2), 0)
          .toFixed(2);
        if (cost > perMealCap || cost > budgetRef.remaining) continue;
        if (!cheapest || cost < cheapest.cost) cheapest = { meal, missing, cost };
      }
      if (!cheapest) break;
      for (const { key, def } of cheapest.missing) {
        cartEntries.push(makeCartEntry(key, def, 1, stateMultiplier));
      }
      budgetRef.remaining = +(budgetRef.remaining - cheapest.cost).toFixed(2);
      console.log(
        `[generatePlan] batch-coverage: ${type} "${cheapest.meal.id}" unlocked for $${cheapest.cost} — $${budgetRef.remaining} left`
      );
    }
    if (batchCookable() < min) {
      console.warn(`[generatePlan] ${type}: only ${batchCookable()} batch-cookable meals (wanted ${min}) — prep segments may repeat fresh meals`);
    }
  }
}

// ── Phase 4: Leftover Budget on Breadth Staples ───────────────────────────────
// Priority order: (a) additional protein variety not yet bought,
// (b) essential produce that unlocks the most meals,
// (c) carb variety, (d) extras.

const VARIETY_ORDER = [
  // (a) additional protein variety
  "canned tuna", "salmon fillet", "egg whites", "extra-firm tofu",
  "lentils", "chickpeas", "black beans",
  // (b) produce essentials — buy 1 pkg each; onion/tomato need more
  "baby spinach", "broccoli florets", "banana", "bell pepper",
  "tomato", "onion",
  // (c) carb variety — oats is a breakfast staple not guaranteed by Phase 2
  "rolled oats", "whole wheat bread", "corn tortillas",
  // (d) extras
  "peanut butter", "plain greek yogurt", "low-fat cottage cheese",
];

// buy onion and tomato in slightly larger quantities
const VARIETY_QTY: Record<string, number> = { tomato: 3, onion: 2 };

function spendRemainingOnVariety(
  cartEntries: CartEntry[],
  budgetRef: { remaining: number },
  diets: string[],
  allergies: string[],
  stateMultiplier: number
): void {
  const isAllowedKey = makeKeyFilter(diets, allergies);
  const cartKeys = new Set(cartEntries.map((e) => e.key));
  const seenProduct = new Set(cartEntries.map((e) => productId(e.defPrice, e.defUnit)));

  for (const key of VARIETY_ORDER) {
    if (budgetRef.remaining <= 0) break;
    if (cartKeys.has(key)) continue;
    if (!isAllowedKey(key)) continue;
    const def = PURCHASABLE_MAP[key];
    if (!def) continue;

    const dedupeId = productId(def.price, def.unit);
    if (seenProduct.has(dedupeId)) continue;

    const ppu = +(def.price * stateMultiplier).toFixed(2);
    const packages = Math.min(VARIETY_QTY[key] ?? 1, Math.floor(budgetRef.remaining / ppu));
    if (packages < 1) continue;
    seenProduct.add(dedupeId);

    const entry = makeCartEntry(key, def, packages, stateMultiplier);
    cartEntries.push(entry);
    cartKeys.add(key);
    budgetRef.remaining = +(budgetRef.remaining - entry.totalCost).toFixed(2);
  }
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

// ── Swap Alternatives ─────────────────────────────────────────────────────────
// Meals that can replace the one in a given slot: cookable from the current
// cart, same slot, not already used in the week, and within diet/allergy rules.
// `cartItemKeys` are the `key` fields of the displayed weekly cart.

export function findSwapAlternatives(
  cartItemKeys: string[],
  slot: Meal["type"],
  usedMealIds: string[],
  diets: string[],
  allergies: string[],
  excludedIds: string[] = []
): Meal[] {
  const cartProducts = new Set<string>();
  for (const key of cartItemKeys) {
    const def = lookupPurchasable(key);
    if (def) cartProducts.add(productId(def.price, def.unit));
  }
  const used = new Set(usedMealIds);
  const excluded = new Set(excludedIds);
  return meals.filter(
    (m) =>
      m.type === slot &&
      !used.has(m.id) &&
      !excluded.has(m.id) &&
      isAllowed(m, diets) &&
      !hasAllergen(m, allergies) &&
      m.ingredients.every((ing) => {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key)) return true;
        const def = lookupPurchasable(key);
        return !def || cartProducts.has(productId(def.price, def.unit));
      })
  );
}

// ── Pool Builder ──────────────────────────────────────────────────────────────
// The cart is the budget controller — no budget-tier or cal/$ filtering.
// A meal is eligible only if ALL its non-pantry ingredients are in the cart.
// Phase 3 already bought ingredients to get each slot to 7 meals where the
// budget allowed, so no fallback purchasing happens here.

interface PoolResult {
  pool: Meal[];
  starved: boolean;      // pool has <7 meals — slot will cycle (repeats)
  usedSafetyNet: boolean; // zero cart-eligible meals — showing allowed meals regardless of cart
  dietRelaxed: boolean;   // catalog has zero meals for this slot matching the diet
}

function buildFinalPool(
  type: Meal["type"],
  cartEntries: CartEntry[],
  diets: string[],
  allergies: string[],
  dislikedIds: Set<string>,
  rng: () => number,
  usedAcrossWeeks: Set<string> = new Set()
): PoolResult {
  const baseFilter = (m: Meal) =>
    m.type === type && isAllowed(m, diets) && !hasAllergen(m, allergies) && !dislikedIds.has(m.id);

  let pool = meals.filter((m) => baseFilter(m) && mealEligibleFromCart(m, cartEntries));
  let usedSafetyNet = false;
  let dietRelaxed = false;

  // Graduated safety net — the pool must never be empty (selection would crash).
  // Relax in order: cart eligibility → dislikes → diet. Allergies are never relaxed.
  if (pool.length === 0) {
    pool = meals.filter(baseFilter);
    usedSafetyNet = true;
    console.warn(`[generatePlan] ${type}: no cart-eligible meals — safety-net pool (${pool.length})`);
  }
  if (pool.length === 0) {
    pool = meals.filter((m) => m.type === type && isAllowed(m, diets) && !hasAllergen(m, allergies));
  }
  if (pool.length === 0) {
    // The catalog simply has no meals of this type for the requested diet.
    pool = meals.filter((m) => m.type === type && !hasAllergen(m, allergies));
    dietRelaxed = true;
    console.warn(`[generatePlan] ${type}: no meals match diet [${diets.join(",")}] — diet relaxed for this slot`);
  }
  if (pool.length === 0) {
    pool = meals.filter((m) => m.type === type);
  }

  console.log(`[generatePlan] ${type} pool: ${pool.length} meals (from cart)`);
  // Meals served in earlier weeks move to the back of the pool — deprioritized,
  // not excluded, since the catalog (~28 meals/slot) can't fill a month repeat-free.
  const shuffled = shuffle(pool, rng);
  const ordered = usedAcrossWeeks.size === 0
    ? shuffled
    : [...shuffled.filter((m) => !usedAcrossWeeks.has(m.id)), ...shuffled.filter((m) => usedAcrossWeeks.has(m.id))];
  return { pool: ordered, starved: pool.length < 7, usedSafetyNet, dietRelaxed };
}

// ── Requirement-Driven Weekly Cart ────────────────────────────────────────────
// The displayed cart derives from the week's FINAL meals — after selection,
// swaps, and portion scaling — aggregated batch-aware: each prep recipe
// contributes its whole-batch ingredients ONCE (cook once, eat across the
// covered days), and every non-batch day-slot contributes its per-serving
// scaled amounts. Aggregated quantities convert to retail packages via
// computePurchasable, so the cart covers exactly what the week cooks —
// no under-buying, no over-buying.

interface WeekProduct {
  key: string;                 // first normalized ingredient key seen for this product
  def: PurchasableUnitDef;
  amounts: string[];           // batch-aware amounts to purchase
  uses: Array<{ dayIndex: number; slot: MealKey; amount: string }>; // every day-slot use, for cost allocation
}

function aggregateWeekProducts(weekDays: DayMeals[], sessions: PrepSession[]): Map<string, WeekProduct> {
  const products = new Map<string, WeekProduct>();
  const productFor = (item: string): WeekProduct | null => {
    const key = normalizeKey(item);
    if (isPantryStaple(key)) return null;
    const def = lookupPurchasable(key);
    if (!def) return null; // unknown ingredient — assumed available, never bought
    const id = productId(def.price, def.unit);
    if (!products.has(id)) products.set(id, { key, def, amounts: [], uses: [] });
    return products.get(id)!;
  };

  // Batch recipes: whole-batch amounts, counted once per prep session.
  const batchCovered = new Set<string>();
  for (const session of sessions) {
    for (const r of session.recipes) {
      for (const ing of r.batchIngredients) productFor(ing.item)?.amounts.push(ing.amount);
      for (const d of r.coveredDayIndexes) batchCovered.add(`${d}|${r.slot}`);
    }
  }
  for (const day of weekDays) {
    for (const slot of MEAL_SLOTS) {
      for (const ing of day[slot].ingredients) {
        const p = productFor(ing.item);
        if (!p) continue;
        // Every slot records a use (cost allocation shares); only non-batch
        // slots also add purchase amounts — batch slots are already covered
        // by their session's whole-batch ingredients.
        p.uses.push({ dayIndex: day.dayIndex, slot, amount: ing.amount });
        if (!batchCovered.has(`${day.dayIndex}|${slot}`)) p.amounts.push(ing.amount);
      }
    }
  }
  return products;
}

interface BuiltWeekCart {
  summary: WeeklyCartSummary;
  products: Map<string, WeekProduct>;
  itemByProduct: Map<string, CartItem>;
}

function buildWeekCart(weekDays: DayMeals[], sessions: PrepSession[], stateMultiplier: number): BuiltWeekCart {
  const products = aggregateWeekProducts(weekDays, sessions);
  const items: CartItem[] = [];
  const itemByProduct = new Map<string, CartItem>();
  for (const [id, p] of Array.from(products.entries())) {
    const r = computePurchasable(p.key, p.amounts, p.amounts.length, stateMultiplier);
    const item: CartItem = {
      key: p.key,
      displayName: p.key.replace(/\b\w/g, (c) => c.toUpperCase()),
      category: categorizeIngredient(p.key),
      packages: r.qty,
      purchaseLabel: r.label,
      pricePerUnit: r.pricePerUnit,
      totalCost: r.total,
    };
    items.push(item);
    itemByProduct.set(id, item);
  }
  const totalCost = +items.reduce((s, i) => s + i.totalCost, 0).toFixed(2);
  return { summary: { items, totalCost }, products, itemByProduct };
}

// ── Meal-Card Cost Allocation ─────────────────────────────────────────────────
// Distributes each cart product's real purchase cost across the day-slots that
// consume it (by share of parsed amount), so per-meal and per-day costs sum
// exactly to the week's cart total — one source of truth for every displayed $.

function assignMealCostsFromCart(weekDays: DayMeals[], built: BuiltWeekCart): void {
  const slotCost = new Map<string, number>(); // `${dayIndex}|${slot}` → $
  for (const [id, p] of Array.from(built.products.entries())) {
    const item = built.itemByProduct.get(id);
    if (!item || p.uses.length === 0) continue;
    const parsedVals = p.uses.map((u) => parseAmountInBase(u.amount, p.def.base, p.def.perCup));
    const totalParsed = parsedVals.reduce((s: number, v) => s + (v ?? 0), 0);
    p.uses.forEach((u, i) => {
      const share = totalParsed > 0 ? (parsedVals[i] ?? 0) / totalParsed : 1 / p.uses.length;
      const k = `${u.dayIndex}|${u.slot}`;
      slotCost.set(k, (slotCost.get(k) ?? 0) + item.totalCost * share);
    });
  }

  // Round per meal, then settle the leftover cents on the priciest meal so the
  // week's meal costs sum to the cart total exactly. Meals are replaced with
  // copies — pool objects from the base catalog must never be mutated.
  let assigned = 0;
  let priciest: { day: DayMeals; slot: MealKey; cost: number } | null = null;
  for (const day of weekDays) {
    for (const slot of MEAL_SLOTS) {
      const cost = +(slotCost.get(`${day.dayIndex}|${slot}`) ?? 0).toFixed(2);
      day[slot] = { ...day[slot], cost };
      assigned = +(assigned + cost).toFixed(2);
      if (!priciest || cost > priciest.cost) priciest = { day, slot, cost };
    }
  }
  const drift = +(built.summary.totalCost - assigned).toFixed(2);
  if (priciest && Math.abs(drift) >= 0.005) {
    priciest.day[priciest.slot] = { ...priciest.day[priciest.slot], cost: +(priciest.cost + drift).toFixed(2) };
  }
  for (const day of weekDays) recomputeDayTotals(day);
}

// ── Week Finalizer: scale → real cart → budget fit → cost reconciliation ─────
// Builds a week's final days and its requirement-driven cart together. If the
// TRUE grocery cost of the week exceeds the weekly budget, portions are scaled
// down proportionally (re-deriving prep sessions and the cart each pass) until
// the real cart fits — the honest tradeoff, instead of silently under-buying.

const MIN_PORTION_SCALE = 0.5;

interface FinalizedWeek {
  days: DayMeals[];
  sessions: PrepSession[];
  cart: WeeklyCartSummary;
  scale: number;        // portion scale applied (1 = full portions)
  fullCost: number;     // cart cost at scale = 1 — the true cost of the target
  portionCapped: boolean;
}

function finalizeWeek(
  makeWeek: () => DayMeals[],
  weekIndex: number,
  calorieTarget: number | null,
  dailyProteinTarget: number | null,
  weeklyBudget: number,
  stateMultiplier: number,
  label: string
): FinalizedWeek {
  let scale = 1;
  let fullCost = 0;
  let result: { days: DayMeals[]; built: BuiltWeekCart; capped: boolean } | null = null;
  let overScale: number | null = null; // smallest scale known to exceed the budget

  const buildAt = (s: number): { days: DayMeals[]; built: BuiltWeekCart; capped: boolean } => {
    const days = makeWeek();
    const capped = calorieTarget
      ? scaleWeekToCalorieTarget(days, calorieTarget * s, dailyProteinTarget ? dailyProteinTarget * s : null)
      : false;
    const built = buildWeekCart(days, derivePrepSessions(days, weekIndex), stateMultiplier);
    return { days, built, capped };
  };

  for (let iter = 0; iter < 12; iter++) {
    result = buildAt(scale);
    const cost = result.built.summary.totalCost;
    if (iter === 0) fullCost = cost;
    if (cost <= weeklyBudget + 0.005) break;
    overScale = scale;
    if (!calorieTarget || scale <= MIN_PORTION_SCALE) break; // can't shrink further — reported honestly
    const next = Math.max(
      MIN_PORTION_SCALE,
      Math.min(scale * (weeklyBudget / cost) * 0.98, scale - 0.01)
    );
    if (next >= scale) break;
    scale = next;
    console.log(
      `[generatePlan] ${label}: groceries $${cost} exceed $${weeklyBudget} budget — retrying at ${Math.round(scale * 100)}% portions`
    );
  }

  // Cart cost is a step function of scale (whole retail packages), so the
  // multiplicative shrink above can overshoot past a package cliff and strand
  // budget. Bisect between the fitting scale and the smallest over-budget
  // scale to serve the largest portions the budget actually covers.
  if (calorieTarget && overScale !== null && result!.built.summary.totalCost <= weeklyBudget + 0.005) {
    let lo = scale, hi = overScale;
    for (let i = 0; i < 7 && hi - lo > 0.005; i++) {
      const mid = (lo + hi) / 2;
      const r = buildAt(mid);
      if (r.built.summary.totalCost <= weeklyBudget + 0.005) { lo = mid; scale = mid; result = r; }
      else hi = mid;
    }
    console.log(`[generatePlan] ${label}: portion bisection settled at ${Math.round(scale * 100)}% — $${result!.built.summary.totalCost}`);
  }

  const { days, built, capped } = result!;
  assignMealCostsFromCart(days, built);
  // Re-derive sessions from the cost-bearing meal copies so the prep guide's
  // recipes show the same reconciled per-serving costs.
  const sessions = derivePrepSessions(days, weekIndex);
  return { days, sessions, cart: built.summary, scale, fullCost, portionCapped: capped };
}

// ── Slot Keys ─────────────────────────────────────────────────────────────────

type MealKey = "breakfast" | "lunch" | "dinner" | "snack";

// ── Day Totals ────────────────────────────────────────────────────────────────

function recomputeDayTotals(day: DayMeals): void {
  day.dailyCalories = day.breakfast.calories + day.lunch.calories + day.dinner.calories + day.snack.calories;
  day.dailyProtein  = day.breakfast.protein  + day.lunch.protein  + day.dinner.protein  + day.snack.protein;
  day.dailyCarbs    = day.breakfast.carbs    + day.lunch.carbs    + day.dinner.carbs    + day.snack.carbs;
  day.dailyFat      = day.breakfast.fat      + day.lunch.fat      + day.dinner.fat      + day.snack.fat;
  day.dailyCost     = +(day.breakfast.cost + day.lunch.cost + day.dinner.cost + day.snack.cost).toFixed(2);
}

// ── Portion Scaler ────────────────────────────────────────────────────────────
// Scales each day's portions toward the calorie target, capped at 0.5×–2× per
// meal. Returns true if any day hit the cap (and may sit short of the target).

function scaleWeekToCalorieTarget(
  week: DayMeals[],
  calorieTarget: number,
  dailyProteinTarget: number | null = null
): boolean {
  let capped = false;
  for (const day of week) {
    const baseTotal = day.breakfast.calories + day.lunch.calories + day.dinner.calories + day.snack.calories;
    const raw = calorieTarget / Math.max(baseTotal, 1);
    const uniform = Math.min(2.0, Math.max(0.5, raw));
    if (raw > 2.0 || raw < 0.5) capped = true;

    const mult: Record<MealKey, number> = { breakfast: uniform, lunch: uniform, dinner: uniform, snack: uniform };
    if (dailyProteinTarget) redistributeCaloriesForProtein(day, mult, dailyProteinTarget);

    day.breakfast = scaleMeal(day.breakfast, mult.breakfast);
    day.lunch     = scaleMeal(day.lunch,     mult.lunch);
    day.dinner    = scaleMeal(day.dinner,    mult.dinner);
    day.snack     = scaleMeal(day.snack,     mult.snack);
    recomputeDayTotals(day);
  }
  return capped;
}

// Shifts calories between a day's meals — within the 0.5×–2× per-meal caps and
// keeping the day's total calories unchanged — to pull delivered protein toward
// the daily target. Protein density (g/cal) is scale-invariant, so moving
// calories from a denser meal to a lighter one trades protein against the
// density gap without touching the calorie total.
function redistributeCaloriesForProtein(
  day: DayMeals,
  mult: Record<MealKey, number>,
  proteinTarget: number
): void {
  const slots: MealKey[] = ["breakfast", "lunch", "dinner", "snack"];
  const density = (k: MealKey) => day[k].protein / Math.max(day[k].calories, 1);
  for (let iter = 0; iter < 8; iter++) {
    const protein = slots.reduce((s, k) => s + day[k].protein * mult[k], 0);
    const over = protein - proteinTarget;
    if (Math.abs(over) < 1) break;
    const byDensity = [...slots].sort((a, b) => density(b) - density(a)); // densest first
    const donor = over > 0
      ? byDensity.find((k) => mult[k] > 0.51)
      : [...byDensity].reverse().find((k) => mult[k] > 0.51);
    const recv = over > 0
      ? [...byDensity].reverse().find((k) => k !== donor && mult[k] < 1.99)
      : byDensity.find((k) => k !== donor && mult[k] < 1.99);
    if (!donor || !recv) break;
    const gap = density(donor) - density(recv); // g of protein per shifted calorie
    if (Math.abs(gap) < 1e-4 || (over > 0) !== (gap > 0)) break;
    const wanted = over / gap; // calories to move donor → recv (positive both directions)
    const x = Math.min(wanted, (mult[donor] - 0.5) * day[donor].calories, (2.0 - mult[recv]) * day[recv].calories);
    if (x < 5) break;
    mult[donor] -= x / day[donor].calories;
    mult[recv]  += x / day[recv].calories;
  }
}

// ── Meal-Prep Week Composer ───────────────────────────────────────────────────
// Each week is built around two prep sessions: Sunday prep batch-cooks the
// lunch + dinner (+ snack when a batch snack is cookable) eaten Monday–
// Wednesday, and Wednesday prep batch-cooks the same slots for Thursday–
// Saturday. The batched meal repeats across the days its session covers —
// intentional and core to the meal-prep model. Breakfasts (and the snack when
// nothing batchable is in the cart) are fresh same-day meals picked per day;
// Sunday is a lighter all-fresh day.
//
// Protein contract: with a protein target, batch picks minimize the projected
// day-ratio deviation (remaining slots estimated at their pool means) and the
// per-day fresh picks then correct each day toward the target — same scoring
// machinery the old per-day selector used, so delivered protein still tracks
// the target after uniform portion scaling. A salt-seeded jitter perturbs
// scores so different salts compose different weeks (regenerate contract);
// rng consumption order is fixed, preserving salt determinism.

const CROSS_WEEK_PENALTY = 0.015;      // ratio-deviation units (fresh per-day picks)
// A batch pick repeats across ~3 days, so re-serving last week's batch recipe
// costs the whole segment — penalize it harder than a single fresh repeat or
// the same 2–3 recipes win the ratio argmin every week of the month.
const BATCH_CROSS_WEEK_PENALTY = 0.04;
const INTRA_WEEK_REUSE_PENALTY = 0.015; // per prior serving this week
const CAL_FLOOR_WEIGHT = 0.5;          // penalty per fraction of calorie-floor shortfall
const SALT_JITTER = 0.01;              // max salt-seeded noise, ratio-deviation units

// Week-relative day positions covered by each prep session. Day 6 (Sunday)
// belongs to no segment — it's the fresh day.
const PREP_SEGMENTS: Array<{ sessionDay: "Sunday" | "Wednesday"; positions: number[] }> = [
  { sessionDay: "Sunday",    positions: [0, 1, 2] }, // Monday–Wednesday
  { sessionDay: "Wednesday", positions: [3, 4, 5] }, // Thursday–Saturday
];

function poolMeans(pool: Meal[]): { cal: number; prot: number } {
  if (pool.length === 0) return { cal: 0, prot: 0 };
  return {
    cal: pool.reduce((s, m) => s + m.calories, 0) / pool.length,
    prot: pool.reduce((s, m) => s + m.protein, 0) / pool.length,
  };
}

function composeWeekPrep(
  pools: Record<MealKey, Meal[]>,
  weekLength: number,
  usedAcrossWeeks: Set<string>,
  targetRatio: number | null,
  dailyCalTarget: number | null,
  goal: string,
  rng: () => number,
  weekLabel: string,
  costWeight: number = 0
): Record<MealKey, Meal>[] {
  // Split each cart-eligible pool by prep type, preserving the salt-shuffled
  // order. Either side falls back to the full pool when empty: a missing
  // batch pool means the segment repeats a fresh meal (cooked ahead anyway),
  // a missing fresh pool means same-day cooking a batch recipe at 1 serving.
  const split = (slot: MealKey) => {
    const batch = pools[slot].filter((m) => m.prepType === "batch");
    const fresh = pools[slot].filter((m) => m.prepType === "fresh");
    if (batch.length === 0) console.warn(`[generatePlan] ${weekLabel} ${slot}: no batch-cookable meals — segment will repeat a fresh meal`);
    return {
      batch: batch.length ? batch : pools[slot],
      fresh: fresh.length ? fresh : pools[slot],
    };
  };
  const prep: Record<MealKey, { batch: Meal[]; fresh: Meal[] }> = {
    breakfast: split("breakfast"), lunch: split("lunch"), dinner: split("dinner"), snack: split("snack"),
  };

  // Snacks batch only when the cart actually unlocked a batch snack.
  const batchSnack = pools.snack.some((m) => m.prepType === "batch");
  const batchSlots: MealKey[] = batchSnack ? ["dinner", "lunch", "snack"] : ["dinner", "lunch"];
  const calFloor = dailyCalTarget ? dailyCalTarget / 2 : 0;

  const usedThisWeek: Record<MealKey, Map<string, number>> =
    { breakfast: new Map(), lunch: new Map(), dinner: new Map(), snack: new Map() };

  // ── Cost pressure ─────────────────────────────────────────────────────────
  // costWeight > 0 means the budget-fit loop found full portions over budget:
  // penalize each candidate by its cost density — dollars per calorie plus
  // dollars per gram of protein (both scale-invariant, so they survive portion
  // scaling to the calorie target) — in ratio-deviation-comparable units.
  // Cheap calorie/protein-dense staples (oats, rice, eggs, ground turkey,
  // peanut butter, beans) score ~0.35; premium meals score ~1.1+.
  const costPenalty = (m: Meal): number =>
    costWeight === 0
      ? 0
      : costWeight * ((m.cost / Math.max(m.calories, 1)) * 100 + m.cost / Math.max(m.protein, 1));
  // Per-serving cost is blind to package quantization: a meal picked for one
  // day whose ingredients nothing else uses buys whole retail packages for a
  // single serving. Under cost pressure, penalize each purchasable product a
  // candidate would newly add to the week, so picks gravitate toward meals
  // sharing the packages the week already buys.
  const weekProducts = new Set<string>();
  const addWeekProducts = (m: Meal): void => {
    for (const ing of m.ingredients) {
      const key = normalizeKey(ing.item);
      if (isPantryStaple(key)) continue;
      const def = lookupPurchasable(key);
      if (def) weekProducts.add(productId(def.price, def.unit));
    }
  };
  const newProductCount = (m: Meal): number => {
    if (costWeight === 0) return 0;
    const seen = new Set<string>();
    for (const ing of m.ingredients) {
      const key = normalizeKey(ing.item);
      if (isPantryStaple(key)) continue;
      const def = lookupPurchasable(key);
      if (!def) continue;
      const id = productId(def.price, def.unit);
      if (!weekProducts.has(id)) seen.add(id);
    }
    return seen.size;
  };
  // Deviations beyond ~8% of the target ratio land the day outside the
  // protein band — escalate sharply there so variety penalties only arbitrate
  // among in-band segment picks and can never buy an out-of-band one. Under
  // cost pressure the escalation steepens so cheapness can't buy an
  // out-of-band day either — the protein/calorie bands outrank the budget.
  const shapeDev = (dev: number): number => {
    const band = (targetRatio as number) * 0.08;
    return dev + Math.max(0, dev - band) * (10 + costWeight * 48);
  };
  // Cost penalties dwarf the base SALT_JITTER, which would collapse every
  // salt onto the identical cheapest argmin — breaking the regenerate
  // contract (different salts → meaningfully different plans). Grow the
  // jitter with the cost pressure so salts still arbitrate among
  // similarly-cheap meals; out-of-band picks stay blocked by the escalated
  // shapeDev, and the budget-fit loop keeps whichever attempt delivers most.
  const jitterAmp = SALT_JITTER * (1 + costWeight * 15);

  const scoreOf = (
    m: Meal, slot: MealKey,
    fixedCal: number, fixedProt: number, expCal: number, expProt: number,
    jitterScale: number,
    crossWeekPenalty: number
  ): number => {
    const projCals = fixedCal + m.calories + expCal;
    const ratio = ((fixedProt + m.protein + expProt) * 4) / Math.max(projCals, 1);
    const dev = Math.abs(ratio - (targetRatio as number));
    const reuse = usedThisWeek[slot].get(m.id) ?? 0;
    return (
      (costWeight > 0 ? shapeDev(dev) + costPenalty(m) + costWeight * 0.06 * newProductCount(m) : dev) +
      reuse * INTRA_WEEK_REUSE_PENALTY +
      (reuse === 0 && usedAcrossWeeks.has(m.id) ? crossWeekPenalty : 0) +
      (calFloor > 0 ? (Math.max(0, calFloor - projCals) / calFloor) * CAL_FLOOR_WEIGHT : 0) +
      rng() * jitterAmp * jitterScale
    );
  };

  // ── Per-segment batch picks ──────────────────────────────────────────────
  const segments = PREP_SEGMENTS
    .map((s) => ({ ...s, positions: s.positions.filter((p) => p < weekLength) }))
    .filter((s) => s.positions.length > 0);

  // Reuse/cross-week penalty for one batch candidate.
  const batchPenalty = (m: Meal, slot: MealKey): number => {
    const reuse = usedThisWeek[slot].get(m.id) ?? 0;
    return reuse * INTRA_WEEK_REUSE_PENALTY +
      (reuse === 0 && usedAcrossWeeks.has(m.id) ? BATCH_CROSS_WEEK_PENALTY : 0);
  };
  // Best achievable day deviation for a fixed (dinner, lunch[, snack]) set:
  // search the real breakfast pool for the corrective pick that completes the
  // day. Mean-based estimates let dense trios through that no breakfast can
  // fix — the segment repeats for 3 days, so that error costs half the week.
  const bestDayDev = (fixedCal: number, fixedProt: number): number => {
    let bestDev = Infinity;
    for (const b of prep.breakfast.fresh) {
      const projCals = fixedCal + b.calories;
      const ratio = ((fixedProt + b.protein) * 4) / Math.max(projCals, 1);
      const dev = Math.abs(ratio - (targetRatio as number)) +
        (calFloor > 0 ? (Math.max(0, calFloor - projCals) / calFloor) * CAL_FLOOR_WEIGHT : 0);
      if (dev < bestDev) bestDev = dev;
    }
    return bestDev;
  };

  const segPicks: Array<Partial<Record<MealKey, Meal>>> = segments.map((seg) => {
    const picks: Partial<Record<MealKey, Meal>> = {};
    if (targetRatio !== null) {
      // Joint (dinner × lunch) search: both repeat all segment, so a greedy
      // dinner pick scored against the lunch-pool mean can strand the segment
      // with only dense lunches. The snack (batched or fresh) is estimated at
      // its pool mean here and picked right after with dinner+lunch fixed.
      const snackExp = poolMeans(batchSnack ? prep.snack.batch : prep.snack.fresh);
      let bestD = prep.dinner.batch[0], bestL = prep.lunch.batch[0], bestScore = Infinity;
      for (const dM of prep.dinner.batch) {
        for (const lM of prep.lunch.batch) {
          const score =
            shapeDev(bestDayDev(dM.calories + lM.calories + snackExp.cal, dM.protein + lM.protein + snackExp.prot)) +
            batchPenalty(dM, "dinner") + batchPenalty(lM, "lunch") +
            costPenalty(dM) + costPenalty(lM) +
            costWeight * 0.02 * (newProductCount(dM) + newProductCount(lM)) +
            rng() * jitterAmp;
          if (score < bestScore - 1e-9) { bestD = dM; bestL = lM; bestScore = score; }
        }
      }
      picks.dinner = bestD;
      picks.lunch = bestL;
      if (batchSnack) {
        let bestS = prep.snack.batch[0]; bestScore = Infinity;
        for (const sM of prep.snack.batch) {
          const score =
            shapeDev(bestDayDev(bestD.calories + bestL.calories + sM.calories, bestD.protein + bestL.protein + sM.protein)) +
            batchPenalty(sM, "snack") +
            costPenalty(sM) +
            costWeight * 0.02 * newProductCount(sM) +
            rng() * jitterAmp * 0.5;
          if (score < bestScore - 1e-9) { bestS = sM; bestScore = score; }
        }
        picks.snack = bestS;
      }
    } else {
      // No protein target: best goal-score batch recipe not yet used this
      // week or month (pool order is salt-shuffled, breaking ties). Under
      // cost pressure the goal score trades off against cost density.
      const legacyScore = (m: Meal) => scoreMeal(m, goal) - costPenalty(m) * 150;
      for (const slot of batchSlots) {
        const pool = prep[slot].batch;
        const unused = pool.filter((m) => !usedThisWeek[slot].has(m.id) && !usedAcrossWeeks.has(m.id));
        const candidates = unused.length ? unused : pool.filter((m) => !usedThisWeek[slot].has(m.id));
        const ranked = (candidates.length ? candidates : pool);
        picks[slot] = ranked.reduce((a, b) => (legacyScore(b) > legacyScore(a) ? b : a));
      }
    }
    for (const slot of Object.keys(picks) as MealKey[]) {
      const m = picks[slot]!;
      // Count one prior serving per covered day so the other segment (and
      // per-day fresh picks) see an escalating reuse penalty.
      usedThisWeek[slot].set(m.id, (usedThisWeek[slot].get(m.id) ?? 0) + seg.positions.length);
      addWeekProducts(m);
      console.log(`[generatePlan] ${weekLabel} ${seg.sessionDay}-prep ${slot}: "${m.name}" (id=${m.id}) × ${seg.positions.length} days`);
    }
    return picks;
  });

  // ── Per-day composition ──────────────────────────────────────────────────
  const legacyIdx: Record<MealKey, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  const days: Record<MealKey, Meal>[] = [];
  for (let d = 0; d < weekLength; d++) {
    const segIdx = segments.findIndex((s) => s.positions.includes(d));
    const batch = segIdx >= 0 ? segPicks[segIdx] : {};
    // Sunday (no segment): every slot is fresh, big slots first so the
    // corrective picking has room to steer.
    const freeSlots: MealKey[] = segIdx >= 0
      ? (batchSnack ? ["breakfast"] : ["breakfast", "snack"])
      : ["dinner", "lunch", "breakfast", "snack"];
    const dayPicks: Partial<Record<MealKey, Meal>> = { ...batch };

    if (targetRatio !== null) {
      let fixedCal = 0, fixedProt = 0;
      for (const slot of Object.keys(batch) as MealKey[]) {
        fixedCal += batch[slot]!.calories;
        fixedProt += batch[slot]!.protein;
      }
      for (let i = 0; i < freeSlots.length; i++) {
        const slot = freeSlots[i];
        const pool = prep[slot].fresh;
        let expCal = 0, expProt = 0;
        for (const r of freeSlots.slice(i + 1)) { const m = poolMeans(prep[r].fresh); expCal += m.cal; expProt += m.prot; }
        // Jitter fades to zero on the last free slot — it stays purely
        // corrective so the day still lands on target.
        const jitterScale = freeSlots.length > 1 ? (freeSlots.length - 1 - i) / (freeSlots.length - 1) : 0;
        let best = pool[0], bestScore = Infinity;
        for (const m of pool) {
          const score = scoreOf(m, slot, fixedCal, fixedProt, expCal, expProt, jitterScale, CROSS_WEEK_PENALTY);
          if (score < bestScore - 1e-9) { best = m; bestScore = score; }
        }
        dayPicks[slot] = best;
        usedThisWeek[slot].set(best.id, (usedThisWeek[slot].get(best.id) ?? 0) + 1);
        addWeekProducts(best);
        fixedCal += best.calories;
        fixedProt += best.protein;
        console.log(`[generatePlan] ${weekLabel} ${DAY_NAMES[d]} ${slot}: fresh pick → "${best.name}" (id=${best.id})`);
      }
    } else {
      for (const slot of freeSlots) {
        // Under cost pressure cycle the cheapest-density meals first so the
        // legacy path still converges toward an affordable week.
        const pool = costWeight > 0
          ? [...prep[slot].fresh].sort((a, b) => costPenalty(a) - costPenalty(b))
          : prep[slot].fresh;
        const meal = pool[legacyIdx[slot] % pool.length];
        legacyIdx[slot]++;
        dayPicks[slot] = meal;
        usedThisWeek[slot].set(meal.id, (usedThisWeek[slot].get(meal.id) ?? 0) + 1);
        console.log(`[generatePlan] ${weekLabel} ${DAY_NAMES[d]} ${slot}: fresh cycle → "${meal.name}" (id=${meal.id})`);
      }
    }
    days.push(dayPicks as Record<MealKey, Meal>);
  }
  return days;
}

// ── Budget-Fit Meal Selection ─────────────────────────────────────────────────
// Composes the week at increasing levels of cost pressure until its REAL
// requirement-driven cart (full portions, scaled to the calorie target) fits
// the weekly budget. Attempt 0 is the unconstrained selection — high budgets
// never see cost pressure and keep full variety. Cost pressure steers the
// selector toward meals built on cheap calorie/protein-dense staples (rice,
// oats, eggs, ground turkey, peanut butter, beans) so a tight budget hits the
// calorie target through cheaper meals FIRST; only when even the cheapest
// in-band composition exceeds the budget does the caller fall back to portion
// reduction (finalizeWeek), reported honestly.

const COST_PRESSURE_WEIGHTS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.5];

interface WeekSelection {
  fin: FinalizedWeek;
  costPressure: number; // cost weight that produced the picks (0 = unconstrained)
}

function pickWeekWithinBudget(
  pools: Record<MealKey, Meal[]>,
  weekLength: number,
  usedAcrossWeeks: Set<string>,
  targetRatio: number | null,
  calorieTarget: number | null,
  dailyProteinTarget: number | null,
  goal: string,
  rng: () => number,
  weekLabel: string,
  weeklyBudget: number,
  stateMultiplier: number,
  weekIndex: number,
  assemble: (picks: Record<MealKey, Meal>[]) => DayMeals[]
): WeekSelection {
  let best: WeekSelection | null = null;
  for (const base of COST_PRESSURE_WEIGHTS) {
    // Salt-perturbed pressure: on a fixed ladder, every salt landing on the
    // same rung converges to the identical cheapest argmin, killing
    // regenerate variety for budget-pinned users. Perturbing each rung by the
    // salt-seeded rng samples a slightly different cost/variety trade-off per
    // salt. Attempt 0 stays exactly 0 (and draws nothing) so unconstrained
    // budgets reproduce the pre-pressure selection untouched.
    const w = base === 0 ? 0 : +(base * (0.7 + 0.6 * rng())).toFixed(3);
    const picks = composeWeekPrep(pools, weekLength, usedAcrossWeeks, targetRatio, calorieTarget, goal, rng, weekLabel, w);
    const fin = finalizeWeek(
      () => assemble(picks), weekIndex, calorieTarget, dailyProteinTarget,
      weeklyBudget, stateMultiplier, `${weekLabel}${w > 0 ? ` @cost-pressure ${w}` : ""}`);
    const attempt: WeekSelection = { fin, costPressure: w };
    // Full portions fit the budget — done. Attempt 0 fitting means high-budget
    // users never see cost pressure and keep their unconstrained variety.
    if (fin.scale >= 0.995 && fin.cart.totalCost <= weeklyBudget + 0.005) {
      if (w > 0) console.log(`[generatePlan] ${weekLabel}: cost pressure ${w} fits full portions at $${fin.cart.totalCost}`);
      return attempt;
    }
    // Otherwise keep the attempt that DELIVERS the most: highest fitted
    // portion scale (package cliffs differ per composition, so the cheapest
    // full-portion cart isn't always the best fit), then lower full cost.
    if (!best ||
        fin.scale > best.fin.scale + 0.002 ||
        (Math.abs(fin.scale - best.fin.scale) <= 0.002 && fin.fullCost < best.fin.fullCost - 0.005)) {
      best = attempt;
    }
    // Without a calorie target portions aren't scaled, so the unconstrained
    // selection already reflects displayed costs — keep current behavior.
    if (!calorieTarget) break;
    console.log(`[generatePlan] ${weekLabel}: cost pressure ${w} → full $${fin.fullCost}, fits at ${Math.round(fin.scale * 100)}% portions`);
  }
  console.log(
    `[generatePlan] ${weekLabel}: best composition (cost pressure ${best!.costPressure}) serves ` +
    `${Math.round(best!.fin.scale * 100)}% portions for $${best!.fin.cart.totalCost}`
  );
  return best!;
}

// ── Prep Session Derivation ───────────────────────────────────────────────────
// Built from the FINAL day assignments (after swaps and portion scaling), so a
// swap that breaks a batch group automatically demotes that day's slot to
// fresh and shrinks the batch. A slot is a session recipe when the same batch
// meal covers ≥2 of the segment's days. Batch ingredient amounts sum the
// covered days' scaled per-serving amounts — one batch for the whole segment,
// not one cook per day (and portion scaling stays accounted for).

function derivePrepSessions(weekDays: DayMeals[], weekIndex: number): PrepSession[] {
  for (const day of weekDays) {
    day.slotSources = { breakfast: "fresh", lunch: "fresh", dinner: "fresh", snack: "fresh" };
  }
  const sessions: PrepSession[] = [];
  for (const seg of PREP_SEGMENTS) {
    const positions = seg.positions.filter((p) => p < weekDays.length);
    if (positions.length === 0) continue;
    const recipes: PrepRecipe[] = [];
    const slotOrder: MealKey[] = ["lunch", "dinner", "snack", "breakfast"];
    for (const slot of slotOrder) {
      const groups = new Map<string, number[]>();
      for (const p of positions) {
        const id = weekDays[p][slot].id;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id)!.push(p);
      }
      for (const [id, ps] of Array.from(groups.entries())) {
        const base = meals.find((m) => m.id === id);
        if (!base || base.prepType !== "batch" || ps.length < 2) continue;
        const totalMult = ps.reduce((s: number, p: number) => s + (weekDays[p][slot].portionMultiplier ?? 1), 0);
        recipes.push({
          meal: weekDays[ps[0]][slot],
          slot,
          servingsToCook: ps.length,
          batchServings: base.batchServings ?? ps.length,
          coveredDayIndexes: ps.map((p) => weekDays[p].dayIndex),
          coveredDays: ps.map((p) => weekDays[p].day),
          storageInstructions: base.storageInstructions ?? "Refrigerate portions in airtight containers up to 4 days.",
          reheatInstructions: base.reheatInstructions ?? "Microwave 2 minutes until steaming, stirring halfway.",
          batchIngredients: base.ingredients.map((ing) => ({
            ...ing,
            amount: scaleIngredientAmount(ing.amount, totalMult),
          })),
        });
        const source: SlotSource = seg.sessionDay === "Sunday" ? "sunday-prep" : "wednesday-prep";
        for (const p of ps) weekDays[p].slotSources[slot] = source;
      }
    }
    if (recipes.length > 0) {
      const first = weekDays[positions[0]].day;
      const last = weekDays[positions[positions.length - 1]].day;
      sessions.push({
        weekIndex,
        sessionDay: seg.sessionDay,
        title: `${seg.sessionDay} Prep`,
        coversLabel: positions.length > 1 ? `Covers ${first} – ${last}` : `Covers ${first}`,
        recipes,
      });
    }
  }
  return sessions;
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
  weightLbs?: number,
  swaps: MealSwap[] = []
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
  // Fraction of daily calories that should come from protein — drives variety
  // purchasing and day composition so delivered protein tracks the target.
  const targetProteinRatio = dailyProteinTarget ? (dailyProteinTarget * 4) / dailyCals : null;

  console.log(
    `[generatePlan] targets — cal: ${dailyCals}/day (${weeklyCalTarget}/wk)` +
    (dailyProteinTarget ? ` | protein: ${dailyProteinTarget}g/day (${weeklyProteinTarget}g/wk)` : "")
  );

  // ── Step 2: Build the grocery cart ───────────────────────────────────────────
  // Phase 1 → proteins, Phase 2 → carbs, Phase 3 → meal-aware variety expansion,
  // Phase 4 → leftover budget on breadth staples. All phases are budget-capped.
  //
  // With a protein target the order inverts: meal-aware variety buys first
  // (half the budget), then Phases 1–2 top up bulk protein/calorie supply with
  // the rest. Macro-per-dollar supply shopping is meal-agnostic — run first it
  // strands most of the budget in products the density-matched meals never
  // use, starving the pools the day selector needs to hit the protein target.
  let cartEntries: CartEntry[];
  let budgetLeft: number;
  if (targetProteinRatio !== null) {
    cartEntries = [];
    const expandRef = { remaining: +(perPersonBudget * 0.5).toFixed(2) };
    expandCartForMealVariety(cartEntries, expandRef, perPersonBudget, diets, allergies, dislikedSet, goal, stateMultiplier, targetProteinRatio);
    ({ entries: cartEntries, budgetLeft } =
      buildTargetedCart(goal, diets, allergies, perPersonBudget, weeklyCalTarget, weeklyProteinTarget, stateMultiplier, cartEntries));
    const topUpRef = { remaining: budgetLeft };
    spendRemainingOnVariety(cartEntries, topUpRef, diets, allergies, stateMultiplier);
  } else {
    ({ entries: cartEntries, budgetLeft } =
      buildTargetedCart(goal, diets, allergies, perPersonBudget, weeklyCalTarget, weeklyProteinTarget, stateMultiplier));
    const budgetRef = { remaining: budgetLeft };
    expandCartForMealVariety(cartEntries, budgetRef, perPersonBudget, diets, allergies, dislikedSet, goal, stateMultiplier, targetProteinRatio);
    spendRemainingOnVariety(cartEntries, budgetRef, diets, allergies, stateMultiplier);
  }

  const cartCost = +cartEntries.reduce((s, e) => s + e.totalCost, 0).toFixed(2);
  const cartCals = cartEntries.reduce((s, e) => s + e.cals, 0);
  const cartProtein = cartEntries.reduce((s, e) => s + e.proteinG, 0);

  console.log(
    `[generatePlan] cart built — cost: $${cartCost.toFixed(2)} / $${perPersonBudget}` +
    ` | cals: ${cartCals} (target ${weeklyCalTarget})` +
    ` | protein: ${cartProtein}g (target ${weeklyProteinTarget ?? "—"}g)`
  );

  // ── Step 3: Budget messaging happens AFTER the real carts are built ──────────
  // The provisioning cart above only decides which meals are cookable; the true
  // weekly cost is known once each week's final scaled meals produce their
  // requirement-driven cart (Step 8), so honest budget messages are composed there.
  let budgetCapMessage: string | undefined;

  // ── Step 4: Seed the RNG ──────────────────────────────────────────────────────
  const goalIndex = ["muscle_gain","fat_loss","maintenance","endurance","general_health"].indexOf(goal) + 1;
  const dietHash  = diets.slice().sort().join(",").split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
  const stateIdx  = stateCode.length >= 2 ? stateCode.charCodeAt(0) + stateCode.charCodeAt(1) : 0;
  const seed      = (Math.round(budget * 100) + goalIndex * 1000 + dietHash + stateIdx + planSalt) >>> 0;
  const rng       = seededRng(seed);

  // ── Step 5: Build meal pools from the purchased cart ─────────────────────────
  // All purchasing already happened in Steps 2's phases; pools are strictly
  // cart-eligible (plus the zero-meal safety net).
  const bResult = buildFinalPool("breakfast", cartEntries, diets, allergies, dislikedSet, rng);
  const lResult = buildFinalPool("lunch",     cartEntries, diets, allergies, dislikedSet, rng);
  const dResult = buildFinalPool("dinner",    cartEntries, diets, allergies, dislikedSet, rng);
  const sResult = buildFinalPool("snack",     cartEntries, diets, allergies, dislikedSet, rng);
  const bPool = bResult.pool;
  const lPool = lResult.pool;
  const dPool = dResult.pool;
  const sPool = sResult.pool;

  let cartFallbackUsed = false;
  if ([bResult, lResult, dResult, sResult].some((r) => r.starved)) {
    cartFallbackUsed = true;
    console.warn(`[generatePlan] one or more pools have fewer than 7 meals — repeats possible`);
    const fallbackMsg =
      "Budget exhausted before building a full 7-meal variety — some meal slots will repeat. Increase your weekly budget for more variety.";
    budgetCapMessage = budgetCapMessage ? `${budgetCapMessage} ${fallbackMsg}` : fallbackMsg;
  }
  if ([bResult, lResult, dResult, sResult].some((r) => r.dietRelaxed)) {
    const dietMsg =
      "We don't yet have recipes for every meal slot matching your dietary preferences — some shown meals fall outside them.";
    budgetCapMessage = budgetCapMessage ? `${budgetCapMessage} ${dietMsg}` : dietMsg;
  }

  const week1Length = Math.min(totalDays, 7);

  // Resolve user swaps once (they replace the deterministic pick for a
  // (day, slot) and are valid only against this salt). Each swap belongs to
  // the week its full dayIndex falls in — a swap made while viewing week 3
  // edits week 3. The week factory below re-applies them on every budget-fit
  // pass. Legacy stored swaps (dayIndex already reduced mod 7) resolve to
  // week 0, exactly as before.
  const resolvedSwaps: Array<{ week: number; idx: number; slot: MealKey; meal: Meal }> = [];
  for (const sw of swaps) {
    if (sw.dayIndex < 0 || sw.dayIndex >= totalDays) continue;
    const week = Math.floor(sw.dayIndex / 7);
    const idx = sw.dayIndex % 7;
    const replacement = meals.find((m) => m.id === sw.mealId);
    if (!replacement || replacement.type !== sw.slot) continue;
    resolvedSwaps.push({ week, idx, slot: sw.slot, meal: replacement });
    console.log(`[generatePlan] swap applied — week ${week + 1} day ${idx} ${sw.slot} → "${replacement.name}" (id=${replacement.id})`);
  }

  // Assembles a fresh, unscaled week from picks. finalizeWeek calls this each
  // budget-fit pass since portion scaling mutates the days in place.
  const assembleWeek = (
    picks: Record<MealKey, Meal>[],
    weekIndex: number,
    weekLength: number
  ): DayMeals[] => {
    const daysOut: DayMeals[] = [];
    for (let i = 0; i < weekLength; i++) {
      const { breakfast, lunch, dinner, snack } = picks[i];
      const day: DayMeals = {
        day: DAY_NAMES[i % 7],
        date: formatDate(weekIndex * 7 + i),
        weekIndex,
        dayIndex: weekIndex * 7 + i,
        breakfast, lunch, dinner, snack,
        dailyCalories: 0, dailyProtein: 0, dailyCarbs: 0, dailyFat: 0, dailyCost: 0,
        slotSources: { breakfast: "fresh", lunch: "fresh", dinner: "fresh", snack: "fresh" },
      };
      recomputeDayTotals(day);
      daysOut.push(day);
    }
    for (const sw of resolvedSwaps) {
      if (sw.week !== weekIndex || sw.idx >= weekLength) continue;
      daysOut[sw.idx][sw.slot] = sw.meal;
      recomputeDayTotals(daysOut[sw.idx]);
    }
    return daysOut;
  };

  // ── Step 6: Compose week 1 around its two prep sessions ─────────────────────
  // Sunday prep covers Monday–Wednesday, Wednesday prep covers Thursday–
  // Saturday; batch lunches/dinners (and a batch snack when cookable) repeat
  // across their session's days. Breakfasts and Sunday are fresh.
  // Selection is budget-fit: if full portions at the calorie target exceed the
  // budget, the week recomposes under escalating cost pressure (cheapest
  // calorie/protein-dense meals) BEFORE any portion reduction.
  // Each cost-pressure attempt is finalized (portions scaled, REAL cart built,
  // budget fit) and the best-delivering attempt wins — Step 8 happens inside.
  const sel1 = pickWeekWithinBudget(
    { breakfast: bPool, lunch: lPool, dinner: dPool, snack: sPool },
    week1Length, new Set(), targetProteinRatio, calorieTarget ?? null, dailyProteinTarget,
    goal, rng, "week 1", perPersonBudget, stateMultiplier, 0,
    (picks) => assembleWeek(picks, 0, week1Length));

  const fin1 = sel1.fin;
  const week1Days = fin1.days;
  const portionCapped = fin1.portionCapped;

  // ── Step 10: Generate remaining weeks (seeded planSalt + weekIndex) ──────────
  // Each later week re-runs pool building and meal selection against the SAME
  // full purchasable cart as week 1 (same budget, same purchase candidates) but
  // with a week-specific seed, so the shuffle prioritizes different meals. Each
  // week's grocery list is then pruned to the ingredients its own meals use, so
  // it can only cost less than the budget-capped full cart. Meals served in
  // earlier weeks are deprioritized (moved to the back of the pool), not
  // excluded — the catalog (~28 meals/slot) can't fill a month repeat-free.
  // Determinism: planSalt + weekIndex always yields the same week and cart.
  const days: DayMeals[] = [...week1Days];
  const weeklyCarts: WeeklyCartSummary[] = [fin1.cart];
  // Prep sessions derive from the FINAL day assignments (post-swap,
  // post-scaling), so week 1's guide reflects any user swaps.
  const prepSessions: PrepSession[][] = [fin1.sessions];
  const weekScales: number[] = [fin1.scale];
  const weekFullCosts: number[] = [fin1.fullCost];
  const weekCostPressures: number[] = [sel1.costPressure];
  const usedAcrossWeeks = new Set<string>();
  for (const day of week1Days) {
    for (const slot of MEAL_SLOTS) usedAcrossWeeks.add(day[slot].id);
  }

  for (let w = 1; w < numWeeks; w++) {
    const weekSeed = (Math.round(budget * 100) + goalIndex * 1000 + dietHash + stateIdx + planSalt + w) >>> 0;
    const weekRng = seededRng(weekSeed);
    const wbPool = buildFinalPool("breakfast", cartEntries, diets, allergies, dislikedSet, weekRng, usedAcrossWeeks).pool;
    const wlPool = buildFinalPool("lunch",     cartEntries, diets, allergies, dislikedSet, weekRng, usedAcrossWeeks).pool;
    const wdPool = buildFinalPool("dinner",    cartEntries, diets, allergies, dislikedSet, weekRng, usedAcrossWeeks).pool;
    const wsPool = buildFinalPool("snack",     cartEntries, diets, allergies, dislikedSet, weekRng, usedAcrossWeeks).pool;

    const weekLength = Math.min(totalDays - w * 7, 7);
    const sel = pickWeekWithinBudget(
      { breakfast: wbPool, lunch: wlPool, dinner: wdPool, snack: wsPool },
      weekLength, usedAcrossWeeks, targetProteinRatio, calorieTarget ?? null, dailyProteinTarget,
      goal, weekRng, `week ${w + 1}`, perPersonBudget, stateMultiplier, w,
      (picks) => assembleWeek(picks, w, weekLength));

    const fin = sel.fin;
    for (const day of fin.days) {
      for (const slot of MEAL_SLOTS) usedAcrossWeeks.add(day[slot].id);
    }
    days.push(...fin.days);
    weeklyCarts.push(fin.cart);
    prepSessions.push(fin.sessions);
    weekScales.push(fin.scale);
    weekFullCosts.push(fin.fullCost);
    weekCostPressures.push(sel.costPressure);
  }

  const weeks: DayMeals[][] = Array.from({ length: numWeeks }, (_, w) => days.slice(w * 7, w * 7 + 7));

  const avgDailyCalories = Math.round(days.reduce((s, d) => s + d.dailyCalories, 0) / days.length);
  const avgDailyProtein  = Math.round(days.reduce((s, d) => s + d.dailyProtein,  0) / days.length);

  // ── Step 9 (cont.): Honest budget messaging from the REAL carts ──────────────
  // Composed here because the genuine weekly cost only exists after every
  // week's requirement-driven cart is built. Never reports "under budget" when
  // the truth is reduced portions.
  const minScale = Math.min(...weekScales);
  const maxFullCost = Math.max(...weekFullCosts);
  const overBudgetWeek = weeklyCarts.findIndex((c) => c.totalCost > perPersonBudget + 0.005);
  // Portion reduction only happens after budget-fit selection already
  // recomposed the week around the cheapest calorie/protein-dense meals — say
  // so, instead of implying cheaper meal choices were left on the table.
  const costPressureUsed = weekCostPressures.some((p) => p > 0);
  const cheapestNote = costPressureUsed ? " (already prioritizing the most budget-friendly meals)" : "";
  let budgetMsg: string | undefined;
  if (overBudgetWeek >= 0) {
    budgetMsg =
      `Week ${overBudgetWeek + 1}'s groceries cost $${weeklyCarts[overBudgetWeek].totalCost.toFixed(2)} ` +
      `even at minimum portions${cheapestNote} — your $${perPersonBudget}/week budget can't cover your targets. ` +
      `Increase your budget to $${Math.ceil(maxFullCost)}/week to fully fund them.`;
  } else if (minScale < 0.995 && calorieTarget) {
    budgetMsg =
      `Full portions for your ${dailyCals.toLocaleString()} cal/day target cost up to ` +
      `$${maxFullCost.toFixed(2)}/week in groceries${cheapestNote}. Portions were reduced to ~${Math.round(minScale * 100)}% ` +
      `(averaging ${avgDailyCalories.toLocaleString()} cal/day) so each week's groceries fit your ` +
      `$${perPersonBudget}/week budget. Increase your budget to $${Math.ceil(maxFullCost)}/week for full portions.`;
  } else if (portionCapped && calorieTarget && avgDailyCalories < Math.round(calorieTarget * 0.95)) {
    budgetMsg =
      `Portions capped at ${calorieTarget > avgDailyCalories ? "2×" : "0.5×"} — plan averages ` +
      `${avgDailyCalories.toLocaleString()} cal/day vs your ${calorieTarget.toLocaleString()} cal goal. ` +
      `Consider a higher budget or fewer dietary restrictions.`;
  }
  if (budgetMsg) budgetCapMessage = budgetCapMessage ? `${budgetMsg} ${budgetCapMessage}` : budgetMsg;

  // ── Step 11: Return the per-week requirement-driven carts ─────────────────────
  const weeklyEstimatedCost = weeklyCarts[0].totalCost;
  const totalPlanCost = +weeklyCarts.reduce((s, c) => s + c.totalCost, 0).toFixed(2);

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
    weeklyCarts,
    prepSessions,
    weeklyPortionScale: weekScales,
    weeklyFullCost: weekFullCosts,
  };
}
