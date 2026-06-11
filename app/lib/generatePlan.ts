import { meals, Meal, DietaryFlag } from "@/app/data/meals";
import { STATE_MULTIPLIERS } from "@/app/data/stateMultipliers";
import { normalizeKey } from "@/app/lib/normalizeIngredient";
import { isPantryStaple, computePurchasable, PURCHASABLE_MAP, lookupPurchasable, PurchasableUnitDef } from "@/app/data/purchasableUnits";

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
  // One cart per week, pruned to the ingredients that week's meals actually
  // use. weeklyCarts[w] pairs with weeks[w].
  weeklyCarts: WeeklyCartSummary[];
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
  const baseFilter = (m: Meal, type: Meal["type"]) =>
    m.type === type && isAllowed(m, diets) && !hasAllergen(m, allergies) && !dislikedIds.has(m.id);

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

// ── Grocery List Builder (kept for internal use) ───────────────────────────────
// Aggregates all ingredients from the week 1 meal template. Used as a utility
// function; the displayed weeklyCarts come from buildTargetedCart instead.

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

// ── Per-Week Cart Pruning ─────────────────────────────────────────────────────
// Phases 1–2 buy by macro math, not by recipe, so the full cart can contain
// items (e.g. a protein bought purely for its protein-per-dollar) that no
// selected meal cooks. Each week keeps only the items its own meals use, so
// every week's grocery list matches that week's plan exactly.

function pruneCartToWeek(cartEntries: CartEntry[], weekDays: DayMeals[], label: string): CartEntry[] {
  const usedProducts = new Set<string>();
  for (const day of weekDays) {
    for (const meal of [day.breakfast, day.lunch, day.dinner, day.snack]) {
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key)) continue;
        const def = lookupPurchasable(key);
        if (def) usedProducts.add(productId(def.price, def.unit));
      }
    }
  }
  const kept = cartEntries.filter((e) => usedProducts.has(productId(e.defPrice, e.defUnit)));
  const pruned = cartEntries.filter((e) => !usedProducts.has(productId(e.defPrice, e.defUnit)));
  if (pruned.length > 0) {
    console.log(`[generatePlan] ${label}: pruned ${pruned.length} unused cart items: ${pruned.map((e) => e.key).join(", ")}`);
  }
  return kept;
}

function cartSummaryFromEntries(entries: CartEntry[]): WeeklyCartSummary {
  return {
    items: entries.map(({ key, displayName, category, packages, purchaseLabel, pricePerUnit, totalCost }) =>
      ({ key, displayName, category, packages, purchaseLabel, pricePerUnit, totalCost })),
    totalCost: +entries.reduce((s, e) => s + e.totalCost, 0).toFixed(2),
  };
}

// ── Pool Index Tracker ────────────────────────────────────────────────────────

interface UsedTracker { breakfast: number; lunch: number; dinner: number; snack: number; }
type MealKey = "breakfast" | "lunch" | "dinner" | "snack";
function freshUsedTracker(): UsedTracker { return { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }; }

// ── Calorie Balancer ──────────────────────────────────────────────────────────

function recomputeDayTotals(day: DayMeals): void {
  day.dailyCalories = day.breakfast.calories + day.lunch.calories + day.dinner.calories + day.snack.calories;
  day.dailyProtein  = day.breakfast.protein  + day.lunch.protein  + day.dinner.protein  + day.snack.protein;
  day.dailyCarbs    = day.breakfast.carbs    + day.lunch.carbs    + day.dinner.carbs    + day.snack.carbs;
  day.dailyFat      = day.breakfast.fat      + day.lunch.fat      + day.dinner.fat      + day.snack.fat;
  day.dailyCost     = +(day.breakfast.cost + day.lunch.cost + day.dinner.cost + day.snack.cost).toFixed(2);
}

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
    recomputeDayTotals(week[maxIdx]);
    recomputeDayTotals(week[minIdx]);
  }
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

// ── Protein-Aware Day Selector ────────────────────────────────────────────────
// Used when a protein target exists. Portion scaling preserves each day's
// protein:calorie ratio, so the only way delivered protein can match the
// target is to compose days whose ratio is already close to it — e.g. pair a
// protein-dense dinner with a light breakfast. Each slot picks the candidate
// minimizing the projected day-ratio deviation (remaining slots estimated at
// their pool means). Variety is a soft constraint here: re-serving a meal this
// week costs an escalating penalty, so a repeat only wins when every fresh
// option would push the day's protein well outside the target band (the
// catalog has no low-protein dinners, so strict no-repeat weeks are forced
// onto the protein-dense tail by midweek). Meals served in earlier weeks
// carry a smaller penalty so fresh-this-month meals win ties. A salt-seeded
// jitter perturbs each candidate's score so different salts compose different
// days — without it the argmin is pool-order-independent and every salt
// converges on the same plan, breaking regenerate/adjust-preferences.

const RATIO_SLOT_ORDER: MealKey[] = ["dinner", "lunch", "breakfast", "snack"];
const CROSS_WEEK_PENALTY = 0.015;      // ratio-deviation units
const INTRA_WEEK_REUSE_PENALTY = 0.015; // per prior serving this week
const CAL_FLOOR_WEIGHT = 0.5;          // penalty per fraction of calorie-floor shortfall
const SALT_JITTER = 0.01;              // max salt-seeded noise, ratio-deviation units

function selectDayMealsForRatio(
  pools: Record<MealKey, Meal[]>,
  usedThisWeek: Record<MealKey, Map<string, number>>,
  usedAcrossWeeks: Set<string>,
  targetRatio: number,
  dailyCalTarget: number | null,
  dayLabel: string,
  rng: () => number
): Record<MealKey, Meal> {
  const means = {} as Record<MealKey, { cal: number; prot: number }>;
  for (const slot of RATIO_SLOT_ORDER) {
    const pool = pools[slot];
    means[slot] = {
      cal: pool.reduce((s, m) => s + m.calories, 0) / pool.length,
      prot: pool.reduce((s, m) => s + m.protein, 0) / pool.length,
    };
  }
  const picked = {} as Record<MealKey, Meal>;
  let cals = 0, prot = 0;
  for (let i = 0; i < RATIO_SLOT_ORDER.length; i++) {
    const slot = RATIO_SLOT_ORDER[i];
    const used = usedThisWeek[slot];
    let expCal = 0, expProt = 0;
    for (const rest of RATIO_SLOT_ORDER.slice(i + 1)) {
      expCal += means[rest].cal;
      expProt += means[rest].prot;
    }
    // Portions cap at 2× — a day whose base calories fall below half the
    // calorie target can never reach it, so penalize undersized days too.
    const calFloor = dailyCalTarget ? dailyCalTarget / 2 : 0;
    // Jitter fades to zero by the last slot: early picks carry the salt's
    // divergence (each cascades through every later projection), while the
    // final pick stays purely corrective so the day still lands on target.
    const jitterScale = (RATIO_SLOT_ORDER.length - 1 - i) / (RATIO_SLOT_ORDER.length - 1);
    let best = pools[slot][0], bestScore = Infinity;
    for (const m of pools[slot]) {
      const projCals = cals + m.calories + expCal;
      const ratio = ((prot + m.protein + expProt) * 4) / Math.max(projCals, 1);
      const score =
        Math.abs(ratio - targetRatio) +
        (used.get(m.id) ?? 0) * INTRA_WEEK_REUSE_PENALTY +
        (!used.has(m.id) && usedAcrossWeeks.has(m.id) ? CROSS_WEEK_PENALTY : 0) +
        (calFloor > 0 ? (Math.max(0, calFloor - projCals) / calFloor) * CAL_FLOOR_WEIGHT : 0) +
        rng() * SALT_JITTER * jitterScale;
      if (score < bestScore - 1e-9) { best = m; bestScore = score; }
    }
    used.set(best.id, (used.get(best.id) ?? 0) + 1);
    picked[slot] = best;
    cals += best.calories;
    prot += best.protein;
    console.log(`[generatePlan] ${dayLabel} ${slot}: ratio-pick → "${best.name}" (id=${best.id})`);
  }
  return picked;
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

  // ── Step 6: Assign 7 days of meals ───────────────────────────────────────────
  const week1Days: DayMeals[] = [];
  const usedTracker = freshUsedTracker();
  const week1Length = Math.min(totalDays, 7);
  const freshUsedSets = (): Record<MealKey, Map<string, number>> =>
    ({ breakfast: new Map(), lunch: new Map(), dinner: new Map(), snack: new Map() });
  const week1Used = freshUsedSets();

  for (let i = 0; i < week1Length; i++) {
    const { breakfast, lunch, dinner, snack } = targetProteinRatio
      ? selectDayMealsForRatio(
          { breakfast: bPool, lunch: lPool, dinner: dPool, snack: sPool },
          week1Used, new Set(), targetProteinRatio, calorieTarget ?? null, DAY_NAMES[i % 7], rng)
      : selectDayMeals(bPool, lPool, dPool, sPool, usedTracker, DAY_NAMES[i % 7]);
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
  // The ratio-aware selector already balances day size (calorie-floor term) and
  // pairs meals by protein density per day — cross-day swaps would scramble
  // that pairing, so the balancer only runs for the legacy selector.
  if (!targetProteinRatio) balanceDailyCalories(week1Days);

  // ── Step 7.5: Apply user meal swaps ──────────────────────────────────────────
  // Swaps replace the deterministic pick for a (day, slot). They run after
  // balancing (so day indices are final) and before portion scaling. The cart
  // pruning in Step 9 then drops ingredients only the swapped-out meal used;
  // Step 9.5 buys anything the swapped-in meal still needs, budget permitting.
  const swappedInMeals: Meal[] = [];
  for (const sw of swaps) {
    const idx = sw.dayIndex % 7;
    if (idx >= week1Days.length) continue;
    const replacement = meals.find((m) => m.id === sw.mealId);
    if (!replacement || replacement.type !== sw.slot) continue;
    week1Days[idx][sw.slot] = replacement;
    swappedInMeals.push(replacement);
    recomputeDayTotals(week1Days[idx]);
    console.log(`[generatePlan] swap applied — day ${idx} ${sw.slot} → "${replacement.name}" (id=${replacement.id})`);
  }

  // ── Step 8: Scale portions to hit the daily calorie target ────────────────────
  const portionCapped = calorieTarget ? scaleWeekToCalorieTarget(week1Days, calorieTarget, dailyProteinTarget) : false;

  if (portionCapped && budgetCapMessage === undefined && calorieTarget) {
    const avgCal = Math.round(week1Days.reduce((s, d) => s + d.dailyCalories, 0) / week1Days.length);
    if (avgCal < Math.round(calorieTarget * 0.95)) {
      budgetCapMessage =
        `Portions capped at ${calorieTarget > avgCal ? "2×" : "0.5×"} — plan averages ` +
        `${avgCal.toLocaleString()} cal/day vs your ${calorieTarget.toLocaleString()} cal goal. ` +
        `Consider a higher budget or fewer dietary restrictions.`;
    }
  }

  // ── Step 9: Prune week 1's cart to items its selected meals use ──────────────
  const finalEntries = pruneCartToWeek(cartEntries, week1Days, "week 1");

  // ── Step 9.5: Buy ingredients swapped-in meals still need ───────────────────
  // The swap UI only offers cart-eligible meals, so this is normally a no-op,
  // but if a swapped meal needs something the prune just freed budget for,
  // buy it as long as the cart stays within budget.
  if (swappedInMeals.length > 0) {
    let cartCost = +finalEntries.reduce((s, e) => s + e.totalCost, 0).toFixed(2);
    for (const meal of swappedInMeals) {
      for (const { key, def } of collectMissingProducts(meal, finalEntries)) {
        const entry = makeCartEntry(key, def, 1, stateMultiplier);
        if (cartCost + entry.totalCost > perPersonBudget) {
          console.warn(`[generatePlan] swap: skipping "${key}" — would exceed budget`);
          continue;
        }
        finalEntries.push(entry);
        cartCost = +(cartCost + entry.totalCost).toFixed(2);
        console.log(`[generatePlan] swap: bought missing ingredient "${key}" ($${entry.totalCost})`);
      }
    }
  }

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
  const weeklyCarts: WeeklyCartSummary[] = [cartSummaryFromEntries(finalEntries)];
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

    const weekDays: DayMeals[] = [];
    const weekTracker = freshUsedTracker();
    const weekUsed = freshUsedSets();
    const weekLength = Math.min(totalDays - w * 7, 7);
    for (let i = 0; i < weekLength; i++) {
      const dayIndex = w * 7 + i;
      const { breakfast, lunch, dinner, snack } = targetProteinRatio
        ? selectDayMealsForRatio(
            { breakfast: wbPool, lunch: wlPool, dinner: wdPool, snack: wsPool },
            weekUsed, usedAcrossWeeks, targetProteinRatio, calorieTarget ?? null, `wk${w + 1} ${DAY_NAMES[i]}`, weekRng)
        : selectDayMeals(wbPool, wlPool, wdPool, wsPool, weekTracker, `wk${w + 1} ${DAY_NAMES[i]}`);
      weekDays.push({
        day: DAY_NAMES[i],
        date: formatDate(dayIndex),
        weekIndex: w,
        dayIndex,
        breakfast, lunch, dinner, snack,
        dailyCalories: breakfast.calories + lunch.calories + dinner.calories + snack.calories,
        dailyProtein:  breakfast.protein  + lunch.protein  + dinner.protein  + snack.protein,
        dailyCarbs:    breakfast.carbs    + lunch.carbs    + dinner.carbs    + snack.carbs,
        dailyFat:      breakfast.fat      + lunch.fat      + dinner.fat      + snack.fat,
        dailyCost:     +(breakfast.cost   + lunch.cost     + dinner.cost     + snack.cost).toFixed(2),
      });
    }

    if (!targetProteinRatio) balanceDailyCalories(weekDays);
    if (calorieTarget) scaleWeekToCalorieTarget(weekDays, calorieTarget, dailyProteinTarget);
    for (const day of weekDays) {
      for (const slot of MEAL_SLOTS) usedAcrossWeeks.add(day[slot].id);
    }
    days.push(...weekDays);
    weeklyCarts.push(cartSummaryFromEntries(pruneCartToWeek(cartEntries, weekDays, `week ${w + 1}`)));
  }

  const weeks: DayMeals[][] = Array.from({ length: numWeeks }, (_, w) => days.slice(w * 7, w * 7 + 7));

  const avgDailyCalories = Math.round(days.reduce((s, d) => s + d.dailyCalories, 0) / days.length);
  const avgDailyProtein  = Math.round(days.reduce((s, d) => s + d.dailyProtein,  0) / days.length);

  // ── Step 11: Return the per-week pruned carts ─────────────────────────────────
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
  };
}
