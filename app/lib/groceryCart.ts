import { PURCHASABLE_MAP } from "@/app/data/purchasableUnits";
import type { DietaryFlag } from "@/app/data/meals";

export interface CartItem {
  key: string;
  displayName: string;
  category: "protein" | "carb" | "produce";
  packages: number;
  purchaseLabel: string;
  pricePerUnit: number;
  totalCost: number;
}

export interface WeeklyCart {
  items: CartItem[];
  totalCost: number;
  ingredientKeys: Set<string>;
}

type IngredientCategory = "protein" | "carb" | "produce";

interface IngredientSpec {
  key: string;
  category: IngredientCategory;
  minBudget: number;
  // calShare: fraction of (dailyCalories × days) this staple should supply.
  // Present on calorie-backbone ingredients. Quantity is computed purely from
  // the user's calorie target and the ingredient's calsPerPkg (from PURCHASABLE_MAP).
  // Absent on variety/produce items, which use defaultPkgs instead.
  calShare?: number;
  defaultPkgs?: number;  // variety/produce items only
  maxPkgs: number;       // hard ceiling in case of extreme calorie targets
  contains: DietaryFlag[];
  requireDiet?: string[];
}

const EXCLUDED_DIET_FLAGS: Record<string, DietaryFlag[]> = {
  vegetarian:  ["meat", "fish"],
  vegan:       ["meat", "dairy", "fish", "eggs"],
  gluten_free: ["gluten"],
  dairy_free:  ["dairy"],
  halal:       ["pork"],
  kosher:      ["pork"],
};

// ── SHOPPING LIST ─────────────────────────────────────────────────────────────
// Each category section: staples (calShare) first, variety (defaultPkgs) second.
// Staples are purchased in Phase 1 at calorie-computed quantities before variety
// is allocated.  minBudget gates whether an item is ever eligible.
//
// Protein calShares: eggs 0.07 + chicken 0.15 + turkey 0.06 + beef 0.05 = 0.33
// Carb calShares:   oats 0.12 + rice 0.18 + pasta 0.12 + bread 0.10 = 0.52
// Combined 0.85 → staples cover ~85% of calorie target; variety/produce fill rest.
// Vegetarian/vegan protein calShares: lentils 0.12 + chickpeas 0.08 +
//   black beans 0.06 + tofu 0.07 (+ eggs 0.07 if not vegan) ≈ 0.33–0.40.
const SHOPPING_LIST: IngredientSpec[] = [
  // ── PROTEINS (50% of budget) ──────────────────────────────────────────────
  // Staple proteins — quantity driven by calorie target via calShare
  { key: "large eggs",             category: "protein", minBudget: 0,   calShare: 0.07, maxPkgs: 6,  contains: ["eggs"] },
  { key: "lentils",                category: "protein", minBudget: 0,   calShare: 0.12, maxPkgs: 10, contains: [], requireDiet: ["vegetarian", "vegan"] },
  { key: "chickpeas",              category: "protein", minBudget: 0,   calShare: 0.08, maxPkgs: 10, contains: [], requireDiet: ["vegetarian", "vegan"] },
  { key: "black beans",            category: "protein", minBudget: 0,   calShare: 0.06, maxPkgs: 10, contains: [], requireDiet: ["vegetarian", "vegan"] },
  { key: "extra-firm tofu",        category: "protein", minBudget: 25,  calShare: 0.07, maxPkgs: 8,  contains: [], requireDiet: ["vegetarian", "vegan"] },
  { key: "chicken breast",         category: "protein", minBudget: 30,  calShare: 0.15, maxPkgs: 16, contains: ["meat"] },
  { key: "ground turkey",          category: "protein", minBudget: 40,  calShare: 0.06, maxPkgs: 10, contains: ["meat"] },
  { key: "ground beef",            category: "protein", minBudget: 90,  calShare: 0.05, maxPkgs: 8,  contains: ["meat"] },
  // Variety proteins — bought after staples with remaining protein budget
  { key: "canned tuna",            category: "protein", minBudget: 0,   defaultPkgs: 4, maxPkgs: 8,  contains: ["fish"] },
  { key: "plain greek yogurt",     category: "protein", minBudget: 50,  defaultPkgs: 1, maxPkgs: 2,  contains: ["dairy"] },
  { key: "low-fat cottage cheese", category: "protein", minBudget: 55,  defaultPkgs: 1, maxPkgs: 2,  contains: ["dairy"] },
  { key: "deli turkey",            category: "protein", minBudget: 70,  defaultPkgs: 1, maxPkgs: 2,  contains: ["meat"] },
  { key: "salmon fillet",          category: "protein", minBudget: 110, defaultPkgs: 2, maxPkgs: 4,  contains: ["fish"] },
  { key: "shrimp",                 category: "protein", minBudget: 130, defaultPkgs: 1, maxPkgs: 2,  contains: ["fish"] },
  { key: "protein powder",         category: "protein", minBudget: 150, defaultPkgs: 1, maxPkgs: 1,  contains: [] },

  // ── CARBS (30% of budget) ─────────────────────────────────────────────────
  // Staple carbs
  { key: "rolled oats",            category: "carb", minBudget: 0,   calShare: 0.12, maxPkgs: 5, contains: ["gluten"] },
  { key: "cooked white rice",      category: "carb", minBudget: 0,   calShare: 0.18, maxPkgs: 8, contains: [] },
  { key: "whole wheat bread",      category: "carb", minBudget: 0,   calShare: 0.10, maxPkgs: 4, contains: ["gluten"] },
  { key: "pasta",                  category: "carb", minBudget: 25,  calShare: 0.12, maxPkgs: 6, contains: ["gluten"] },
  // Variety carbs — bought after staples with remaining carb budget
  { key: "corn tortillas",         category: "carb", minBudget: 30,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "potato",                 category: "carb", minBudget: 30,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "flour tortilla",         category: "carb", minBudget: 40,  defaultPkgs: 1, maxPkgs: 2, contains: ["gluten"] },
  { key: "sweet potato",           category: "carb", minBudget: 50,  defaultPkgs: 3, maxPkgs: 6, contains: [] },
  { key: "brown rice",             category: "carb", minBudget: 55,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "pita bread",             category: "carb", minBudget: 65,  defaultPkgs: 1, maxPkgs: 1, contains: ["gluten"] },
  { key: "quinoa",                 category: "carb", minBudget: 100, defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "granola",                category: "carb", minBudget: 120, defaultPkgs: 1, maxPkgs: 2, contains: ["gluten"] },

  // ── PRODUCE & EXTRAS (20% of budget) ─────────────────────────────────────
  { key: "banana",                 category: "produce", minBudget: 0,   defaultPkgs: 1, maxPkgs: 3, contains: [] },
  { key: "onion",                  category: "produce", minBudget: 0,   defaultPkgs: 3, maxPkgs: 6, contains: [] },
  { key: "broccoli",               category: "produce", minBudget: 20,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "baby spinach",           category: "produce", minBudget: 25,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "peanut butter",          category: "produce", minBudget: 30,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "tomato",                 category: "produce", minBudget: 35,  defaultPkgs: 3, maxPkgs: 6, contains: [] },
  { key: "bell pepper",            category: "produce", minBudget: 40,  defaultPkgs: 2, maxPkgs: 5, contains: [] },
  { key: "garlic cloves",          category: "produce", minBudget: 40,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "carrot",                 category: "produce", minBudget: 45,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "avocado",                category: "produce", minBudget: 70,  defaultPkgs: 3, maxPkgs: 6, contains: [] },
  { key: "mixed berries",          category: "produce", minBudget: 80,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "mushrooms",              category: "produce", minBudget: 90,  defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "kale",                   category: "produce", minBudget: 100, defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "almond butter",          category: "produce", minBudget: 110, defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "walnuts",                category: "produce", minBudget: 130, defaultPkgs: 1, maxPkgs: 2, contains: [] },
  { key: "chia seeds",             category: "produce", minBudget: 140, defaultPkgs: 1, maxPkgs: 1, contains: [] },
];

function toDisplayName(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

function pluralizeUnit(unit: string, qty: number): string {
  if (qty === 1) return `1 ${unit}`;
  const compound = unit.match(/^([^(]+?)\s*(\(.+)$/);
  if (compound) return `${qty} ${compound[1].trim()}s ${compound[2]}`;
  if (unit === "loaf") return `${qty} loaves`;
  if (unit === "tomato") return `${qty} tomatoes`;
  if (unit === "avocado") return `${qty} avocados`;
  if (unit.endsWith("ch")) return `${qty} ${unit}es`;
  if (unit.endsWith("x")) return `${qty} ${unit}es`;
  return `${qty} ${unit}s`;
}

export function buildWeeklyCart(
  weeklyBudget: number,
  stateMultiplier: number,
  diet: string = "",
  dailyCalories: number = 2000,
  days: number = 7,
): WeeklyCart {
  const excludedFlags = EXCLUDED_DIET_FLAGS[diet] ?? [];
  const totalTargetCals = dailyCalories * days;

  const categoryBudget: Record<IngredientCategory, number> = {
    protein: weeklyBudget * 0.50,
    carb:    weeklyBudget * 0.30,
    produce: weeklyBudget * 0.20,
  };
  const spent: Record<IngredientCategory, number> = { protein: 0, carb: 0, produce: 0 };

  const eligible = SHOPPING_LIST.filter((s) => {
    if (weeklyBudget < s.minBudget) return false;
    if (s.contains.some((f) => excludedFlags.includes(f))) return false;
    if (s.requireDiet && s.requireDiet.length > 0 && !s.requireDiet.includes(diet)) return false;
    return true;
  });

  const staples = eligible.filter((s) => s.calShare !== undefined);
  const variety = eligible.filter((s) => s.calShare === undefined);

  const items: CartItem[] = [];

  function addItem(spec: IngredientSpec, pkgs: number): void {
    if (pkgs <= 0) return;
    const def = PURCHASABLE_MAP[spec.key];
    if (!def) return;
    const unitPrice = +(def.price * stateMultiplier).toFixed(2);
    const totalCost = +(pkgs * unitPrice).toFixed(2);
    spent[spec.category] = +(spent[spec.category] + totalCost).toFixed(2);
    items.push({
      key: spec.key,
      displayName: toDisplayName(spec.key),
      category: spec.category,
      packages: pkgs,
      purchaseLabel: pluralizeUnit(def.unit, pkgs),
      pricePerUnit: unitPrice,
      totalCost,
    });
  }

  // ── Phase 1: Staples ───────────────────────────────────────────────────────
  // For each staple, compute exactly how many packages are needed to cover
  // its calShare of the user's total weekly calorie target, then buy up to
  // that quantity within the category budget and maxPkgs ceiling.
  for (const spec of staples) {
    const def = PURCHASABLE_MAP[spec.key];
    if (!def || !def.calsPerPkg) continue;

    const pkgsNeeded = Math.ceil((totalTargetCals * spec.calShare!) / def.calsPerPkg);
    const unitPrice = def.price * stateMultiplier;
    const remaining = categoryBudget[spec.category] - spent[spec.category];
    const maxAffordable = Math.floor(remaining / unitPrice);
    const pkgs = Math.min(pkgsNeeded, spec.maxPkgs, maxAffordable);
    addItem(spec, pkgs);
  }

  // ── Phase 2: Variety ───────────────────────────────────────────────────────
  // Buy defaultPkgs of each variety item from whatever category budget remains
  // after staples. Higher-budget tiers unlock more items via minBudget.
  for (const spec of variety) {
    const def = PURCHASABLE_MAP[spec.key];
    if (!def) continue;

    const unitPrice = def.price * stateMultiplier;
    const remaining = categoryBudget[spec.category] - spent[spec.category];
    if (remaining < unitPrice) continue;

    const pkgs = Math.min(spec.defaultPkgs ?? 1, spec.maxPkgs, Math.floor(remaining / unitPrice));
    if (pkgs <= 0) continue;
    addItem(spec, pkgs);
  }

  // ── Phase 3: Fill variety to maxPkgs ──────────────────────────────────────
  // Use any remaining category budget to top up variety items. Staples are not
  // added here — their quantity is fixed by the calorie calculation.
  for (const spec of variety) {
    const remaining = categoryBudget[spec.category] - spent[spec.category];
    if (remaining < 0.50) continue;

    const def = PURCHASABLE_MAP[spec.key];
    if (!def) continue;

    const existingItem = items.find((i) => i.key === spec.key);
    if (!existingItem || existingItem.packages >= spec.maxPkgs) continue;

    const unitPrice = def.price * stateMultiplier;
    const canAdd = Math.min(
      Math.floor(remaining / unitPrice),
      spec.maxPkgs - existingItem.packages
    );
    if (canAdd <= 0) continue;

    existingItem.packages += canAdd;
    existingItem.purchaseLabel = pluralizeUnit(def.unit, existingItem.packages);
    const addedCost = +(canAdd * unitPrice).toFixed(2);
    existingItem.totalCost = +(existingItem.totalCost + addedCost).toFixed(2);
    spent[spec.category] = +(spent[spec.category] + addedCost).toFixed(2);
  }

  const totalCost = +items.reduce((s, i) => s + i.totalCost, 0).toFixed(2);
  const ingredientKeys = new Set(items.map((i) => i.key));
  return { items, totalCost, ingredientKeys };
}

// Patterns for premium-ingredient gating.
// A meal is excluded from the pool if it requires a premium ingredient that isn't in the cart.
export interface PremiumCheck {
  pattern: RegExp;
  cartKey: string;
}

export const PREMIUM_INGREDIENT_CHECKS: PremiumCheck[] = [
  { pattern: /\bsalmon\b/i,          cartKey: "salmon fillet" },
  { pattern: /\bshrimp\b/i,          cartKey: "shrimp" },
  { pattern: /protein powder/i,      cartKey: "protein powder" },
  { pattern: /\bquinoa\b/i,          cartKey: "quinoa" },
  { pattern: /\bgranola\b/i,         cartKey: "granola" },
  { pattern: /\bavocado\b/i,         cartKey: "avocado" },
  { pattern: /\bwalnuts?\b/i,        cartKey: "walnuts" },
  { pattern: /mixed berries/i,       cartKey: "mixed berries" },
  { pattern: /\bmushroom/i,          cartKey: "mushrooms" },
  { pattern: /\bkale\b/i,            cartKey: "kale" },
  { pattern: /almond butter/i,       cartKey: "almond butter" },
  { pattern: /\bchia seeds?\b/i,     cartKey: "chia seeds" },
  { pattern: /\bground beef\b/i,     cartKey: "ground beef" },
  { pattern: /\bcottage cheese\b/i,  cartKey: "low-fat cottage cheese" },
  { pattern: /\btofu\b/i,            cartKey: "extra-firm tofu" },
  { pattern: /\blentils?\b/i,        cartKey: "lentils" },
  { pattern: /\bchickpeas?\b/i,      cartKey: "chickpeas" },
  { pattern: /\bblack beans?\b/i,    cartKey: "black beans" },
];
