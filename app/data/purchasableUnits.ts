// Purchasable unit definitions: how ingredients are actually sold at retail.
// Used by the grocery list page to show real shopping quantities, not recipe quantities.

export type BaseUnit = "tbsp" | "oz" | "count";

export interface PurchasableUnitDef {
  unit: string;        // singular purchasable unit label, e.g. "lb", "dozen", "loaf"
  price: number;       // national-average retail price per purchasable unit (pre state-multiplier)
  base: BaseUnit;      // unit system used for aggregating recipe amounts
  capacity: number;    // how many base units fit in one purchasable unit
  calsPerPkg?: number; // USDA-sourced calories in one purchasable unit; set on calorie-backbone staples
  perCup?: number;     // base units per 1 cup of the recipe measure, for non-tbsp-base items
                       // whose recipes measure in cups (e.g. "2 cups baby spinach" → oz)
}

// ── Pantry Staples ────────────────────────────────────────────────────────────
// Items assumed to be in a typical kitchen; listed separately with no price impact on the total.
export const PANTRY_STAPLES = new Set([
  // Water
  "water",
  // Salts & basic seasoning
  "salt",
  "black pepper",
  "salt and pepper",
  "pepper",
  // Oils & fats
  "olive oil",
  "butter",
  "cooking spray",
  // Dry spices & herbs — base set
  "garlic powder",
  "onion powder",
  "cumin",
  "paprika",
  "smoked paprika",
  "chili powder",
  "cayenne pepper",
  "cayenne",
  "pinch of cayenne",
  "dried oregano",
  "oregano",
  "basil",
  "fresh basil",
  "cinnamon",
  "nutmeg",
  "ginger powder",
  // Jarred spices that appear on the grocery list but are pantry-grade
  // normalizeKey singularizes "flakes" → "flake", so both forms needed
  "red pepper flakes",
  "red pepper flake",
  "italian seasoning",
  // Extracts & flavor enhancers
  // "vanilla extract" normalizes to "extract" via normalizeKey (strips "vanilla" adjective)
  "vanilla extract",
  "extract",
  // Sweeteners & baking
  "sugar",
  "flour",
  "whole wheat flour",
  "oat flour",
  "baking powder",
  "baking soda",
  // Common flavor bases — appear in almost every savory or sweet recipe
  // normalizeKey("Garlic, minced") → "garlic"; "garlic cloves" → "garlic clove"
  "garlic",
  "garlic clove",
  // Honey is used as a sweetener in small amounts across most recipes
  "honey",
  // Condiments & sauces
  "soy sauce",
  "hot sauce",
  "vinegar",
  "rice vinegar",
  "white vinegar",
]);

export function isPantryStaple(key: string): boolean {
  return PANTRY_STAPLES.has(key);
}

// ── Purchasable Unit Definitions ──────────────────────────────────────────────
// Keys must match the normalized ingredient name (lowercase, no parens, no comma suffixes).
export const PURCHASABLE_MAP: Record<string, PurchasableUnitDef> = {
  // ── Proteins ────────────────────────────────────────────────────────────────
  // calsPerPkg: USDA kcal per purchasable unit (used by groceryCart to quantity-plan by calorie target)
  "chicken breast":           { unit: "lb",              price: 3.71,  base: "oz",    capacity: 16, calsPerPkg: 600  }, // Walmart Great Value value pack
  "grilled chicken breast":   { unit: "lb",              price: 3.71,  base: "oz",    capacity: 16 },
  "cooked chicken breast":    { unit: "lb",              price: 3.71,  base: "oz",    capacity: 16 },
  "ground beef":              { unit: "lb",              price: 5.75,  base: "oz",    capacity: 16, calsPerPkg: 975  }, // Walmart 80/20
  "ground turkey":            { unit: "lb",              price: 3.99,  base: "oz",    capacity: 16, calsPerPkg: 680  }, // Walmart Great Value 93/7
  "sirloin steak":            { unit: "lb",              price: 8.99,  base: "oz",    capacity: 16 }, // top sirloin ~500 kcal/100g cooked
  "tempeh":                   { unit: "pkg (8 oz)",      price: 3.49,  base: "oz",    capacity: 8  }, // fermented soy, ~193 kcal/100g
  "salmon fillet":            { unit: "fillet",          price: 3.99,  base: "count", capacity: 1 },
  "smoked salmon":            { unit: "pkg (4 oz)",      price: 5.99,  base: "oz",    capacity: 4 },
  "canned tuna":              { unit: "can (5 oz)",      price: 1.49,  base: "count", capacity: 1 },
  "tuna":                     { unit: "can (5 oz)",      price: 1.49,  base: "count", capacity: 1 },
  "medium shrimp":            { unit: "lb",              price: 7.99,  base: "oz",    capacity: 16 },
  "shrimp":                   { unit: "lb",              price: 7.99,  base: "oz",    capacity: 16 },
  "deli turkey":              { unit: "pkg (8 oz)",      price: 3.49,  base: "oz",    capacity: 8 },
  "sliced turkey breast":     { unit: "pkg (8 oz)",      price: 3.49,  base: "oz",    capacity: 8 },
  "deli ham":                 { unit: "pkg (8 oz)",      price: 2.99,  base: "oz",    capacity: 8 },
  "ham":                      { unit: "pkg (8 oz)",      price: 2.99,  base: "oz",    capacity: 8 },
  "bacon strips":             { unit: "pkg (12 strips)", price: 5.49,  base: "count", capacity: 12 },
  "bacon":                    { unit: "pkg (12 strips)", price: 5.49,  base: "count", capacity: 12 },
  "extra-firm tofu":          { unit: "block (14 oz)",   price: 2.49,  base: "oz",    capacity: 14, calsPerPkg: 290  }, // 73 kcal/100g × 396g
  "tofu":                     { unit: "block (14 oz)",   price: 2.49,  base: "oz",    capacity: 14 },

  // ── Eggs & Dairy ────────────────────────────────────────────────────────────
  "egg":                      { unit: "dozen",              price: 1.97, base: "count", capacity: 12 }, // Walmart Great Value
  "large eggs":               { unit: "dozen",              price: 1.97, base: "count", capacity: 12, calsPerPkg: 864  }, // Walmart Great Value
  "large egg":                { unit: "dozen",              price: 1.97, base: "count", capacity: 12 },
  "egg whites":               { unit: "carton",             price: 3.49, base: "count", capacity: 1 },
  "plain greek yogurt":       { unit: "container (32 oz)",  price: 4.99, base: "tbsp",  capacity: 64 },
  "greek yogurt":             { unit: "container (32 oz)",  price: 4.99, base: "tbsp",  capacity: 64 },
  "milk":                     { unit: "gallon",             price: 2.72, base: "tbsp",  capacity: 256 }, // Walmart Great Value
  "2% milk":                  { unit: "gallon",             price: 2.72, base: "tbsp",  capacity: 256 },
  "unsweetened almond milk":  { unit: "half-gallon",        price: 3.49, base: "tbsp",  capacity: 128 },
  "almond milk":              { unit: "half-gallon",        price: 3.49, base: "tbsp",  capacity: 128 },
  "low-fat cottage cheese":   { unit: "container (16 oz)",  price: 2.99, base: "tbsp",  capacity: 32 },
  "cottage cheese":           { unit: "container (16 oz)",  price: 2.99, base: "tbsp",  capacity: 32 },
  "cream cheese":             { unit: "block (8 oz)",       price: 2.49, base: "oz",    capacity: 8 },
  "shredded cheddar cheese":  { unit: "bag (8 oz)",         price: 2.49, base: "tbsp",  capacity: 32 },
  "shredded mexican cheese":  { unit: "bag (8 oz)",         price: 2.49, base: "tbsp",  capacity: 32 },
  "shredded cheese":          { unit: "bag (8 oz)",         price: 2.49, base: "tbsp",  capacity: 32 },
  "parmesan":                 { unit: "shaker (5 oz)",      price: 3.99, base: "tbsp",  capacity: 16 },
  "feta cheese":              { unit: "container (6 oz)",   price: 3.49, base: "oz",    capacity: 6 },
  "blue cheese crumbles":     { unit: "container (4 oz)",   price: 3.99, base: "oz",    capacity: 4 },
  "swiss cheese":             { unit: "pkg (8 oz)",         price: 2.99, base: "oz",    capacity: 8 },
  "sour cream":               { unit: "container (16 oz)",  price: 2.49, base: "tbsp",  capacity: 32 },
  "light coconut milk":       { unit: "can (13.5 oz)",      price: 1.99, base: "tbsp",  capacity: 27 },
  "coconut milk":             { unit: "can (13.5 oz)",      price: 1.99, base: "tbsp",  capacity: 27 },

  // ── Produce ─────────────────────────────────────────────────────────────────
  "banana":                   { unit: "bunch (5)",    price: 1.25, base: "count", capacity: 5 },
  "ripe banana":              { unit: "bunch (5)",    price: 1.25, base: "count", capacity: 5 },
  "ripe bananas":             { unit: "bunch (5)",    price: 1.25, base: "count", capacity: 5 },
  "frozen banana":            { unit: "bunch (5)",    price: 1.25, base: "count", capacity: 5 },
  "avocado":                  { unit: "avocado",      price: 1.00, base: "count", capacity: 1 },
  "ripe avocado":             { unit: "avocado",      price: 1.00, base: "count", capacity: 1 },
  "tomato":                   { unit: "tomato",       price: 0.89, base: "count", capacity: 1 },
  "tomato slices":            { unit: "tomato",       price: 0.89, base: "count", capacity: 1 },
  "diced tomato":             { unit: "tomato",       price: 0.89, base: "count", capacity: 1 },
  "cherry tomatoes":          { unit: "pint",         price: 2.99, base: "count", capacity: 20 },
  "bell pepper":              { unit: "pepper",       price: 0.99, base: "count", capacity: 1 },
  "broccoli florets":         { unit: "bag (12 oz)",  price: 1.16, base: "oz",    capacity: 12 }, // Walmart Great Value frozen
  "broccoli":                 { unit: "head",         price: 1.99, base: "count", capacity: 1 },
  "potato":                   { unit: "bag (5 lb)",   price: 3.99, base: "count", capacity: 8 },
  "sweet potato":             { unit: "sweet potato", price: 0.99, base: "count", capacity: 1 },
  "medium sweet potato":      { unit: "sweet potato", price: 0.99, base: "count", capacity: 1 },
  "asparagus spears":         { unit: "bunch",        price: 2.99, base: "count", capacity: 1 },
  "asparagus":                { unit: "bunch",        price: 2.99, base: "count", capacity: 1 },
  "zucchini":                 { unit: "zucchini",     price: 0.99, base: "count", capacity: 1 },
  "kale":                     { unit: "bunch",        price: 1.99, base: "count", capacity: 1 },
  "baby spinach":             { unit: "bag (5 oz)",   price: 3.49, base: "oz",    capacity: 5, perCup: 1 },    // 1 cup fresh spinach ≈ 1 oz
  "spinach":                  { unit: "bag (5 oz)",   price: 3.49, base: "oz",    capacity: 5, perCup: 1 },
  "romaine lettuce":          { unit: "head",         price: 1.49, base: "count", capacity: 1 },
  "romaine or butter lettuce":{ unit: "head",         price: 1.49, base: "count", capacity: 1 },
  "cucumber":                 { unit: "cucumber",     price: 0.89, base: "count", capacity: 1 },
  "celery stalk":             { unit: "bunch",        price: 1.49, base: "count", capacity: 8 },
  "celery stalks":            { unit: "bunch",        price: 1.49, base: "count", capacity: 8 },
  "carrot":                   { unit: "bag (1 lb)",   price: 1.49, base: "count", capacity: 7 },
  "onion":                    { unit: "onion",        price: 0.69, base: "count", capacity: 1, perCup: 1 },    // 1 medium onion ≈ 1 cup diced
  "red onion":                { unit: "red onion",    price: 0.99, base: "count", capacity: 1, perCup: 1 },
  "green onions":             { unit: "bunch",        price: 0.99, base: "count", capacity: 1 },
  "mushrooms":                { unit: "pkg (8 oz)",   price: 2.49, base: "oz",    capacity: 8 },
  "mixed berries":            { unit: "bag (12 oz)",  price: 3.99, base: "oz",    capacity: 12 },
  "pea":                      { unit: "bag (12 oz)",  price: 1.49, base: "oz",    capacity: 12 },
  "frozen peas":              { unit: "bag (12 oz)",  price: 1.49, base: "oz",    capacity: 12 },
  "corn":                     { unit: "can (15 oz)",  price: 0.99, base: "count", capacity: 1 },
  "shelled edamame":          { unit: "bag (12 oz)",  price: 2.99, base: "oz",    capacity: 12 },
  "kiwi":                     { unit: "kiwi",         price: 0.75, base: "count", capacity: 1 },
  "mango":                    { unit: "mango",        price: 0.99, base: "count", capacity: 1 },
  "lemon":                    { unit: "lemon",        price: 0.49, base: "count", capacity: 1 },
  "mixed stir-fry vegetables":{ unit: "bag (12 oz)",  price: 2.99, base: "oz",    capacity: 12 },
  "shredded cabbage":         { unit: "bag (14 oz)",  price: 1.99, base: "oz",    capacity: 14 },
  "cabbage slaw mix":         { unit: "bag (14 oz)",  price: 1.99, base: "oz",    capacity: 14 },

  // ── Grains & Bread ──────────────────────────────────────────────────────────
  "rolled oats":              { unit: "canister (42 oz)",  price: 3.99, base: "tbsp",  capacity: 224, calsPerPkg: 4630 }, // 389 kcal/100g dry × 1190g
  "whole wheat bread":        { unit: "loaf",              price: 3.49, base: "count", capacity: 18,  calsPerPkg: 1350 }, // 75 kcal/slice × 18 slices
  "sourdough bread":          { unit: "loaf",              price: 4.99, base: "count", capacity: 14 },
  "large flour tortilla":     { unit: "pkg (8-count)",     price: 2.99, base: "count", capacity: 8 },
  "flour tortilla":           { unit: "pkg (8-count)",     price: 2.99, base: "count", capacity: 8 },
  "corn tortillas":           { unit: "pkg (30-count)",    price: 2.49, base: "count", capacity: 30 },
  "whole wheat bagel":        { unit: "pkg (6-count)",     price: 3.49, base: "count", capacity: 6 },
  "pita bread":               { unit: "pkg (6-count)",     price: 2.99, base: "count", capacity: 6 },
  "rice":                     { unit: "bag (2 lb)",        price: 2.49, base: "tbsp",  capacity: 160 },
  "cooked white rice":        { unit: "bag (2 lb)",        price: 2.49, base: "tbsp",  capacity: 160, calsPerPkg: 3310 }, // 365 kcal/100g dry × 907g
  "brown rice":               { unit: "bag (2 lb)",        price: 2.99, base: "tbsp",  capacity: 160, calsPerPkg: 3240 }, // ~357 kcal/100g dry × 907g
  "cooked rice":              { unit: "bag (2 lb)",        price: 2.49, base: "tbsp",  capacity: 160 },
  "day-old cooked rice":      { unit: "bag (2 lb)",        price: 2.49, base: "tbsp",  capacity: 160 },
  "cooked basmati rice":      { unit: "bag (2 lb)",        price: 2.99, base: "tbsp",  capacity: 160 },
  "basmati rice":             { unit: "bag (2 lb)",        price: 2.99, base: "tbsp",  capacity: 160 },
  "sushi rice":               { unit: "bag (2 lb)",        price: 3.49, base: "tbsp",  capacity: 160 },
  "cooked quinoa":            { unit: "bag (16 oz dry)",   price: 4.99, base: "tbsp",  capacity: 192 },
  "quinoa":                   { unit: "bag (16 oz dry)",   price: 4.99, base: "tbsp",  capacity: 192 },
  "penne or rotini pasta":    { unit: "box (16 oz)",       price: 0.98, base: "oz",    capacity: 16 }, // Walmart Great Value
  "pasta":                    { unit: "box (16 oz)",       price: 0.98, base: "oz",    capacity: 16,  calsPerPkg: 1680 }, // Walmart Great Value
  "soba noodles":             { unit: "pkg (9 oz)",        price: 2.99, base: "oz",    capacity: 9 },
  "plain rice cakes":         { unit: "bag (3.5 oz)",      price: 2.49, base: "count", capacity: 7 },
  "granola":                  { unit: "bag (12 oz)",       price: 3.99, base: "tbsp",  capacity: 48 },
  "whole grain cereal":       { unit: "box (18 oz)",       price: 3.99, base: "count", capacity: 10 },
  "nori sheets":              { unit: "pkg (10-count)",    price: 3.49, base: "count", capacity: 10 },

  // ── Protein Supplements ─────────────────────────────────────────────────────
  "vanilla protein powder":   { unit: "container (2 lb)", price: 25.99, base: "count", capacity: 30 },
  "protein powder":           { unit: "container (2 lb)", price: 25.99, base: "count", capacity: 30 },

  // ── Canned & Packaged ───────────────────────────────────────────────────────
  "chickpeas":                { unit: "can (15 oz)",    price: 1.29, base: "count", capacity: 1,  calsPerPkg: 700  }, // 164 kcal/100g cooked × 425g
  "black beans":              { unit: "can (15 oz)",    price: 1.09, base: "count", capacity: 1,  calsPerPkg: 560  }, // 132 kcal/100g cooked × 425g
  "cannellini beans":         { unit: "can (15 oz)",    price: 1.29, base: "count", capacity: 1 },
  "green or brown lentils":   { unit: "bag (16 oz)",    price: 1.99, base: "oz",    capacity: 16 },
  "lentils":                  { unit: "bag (16 oz)",    price: 1.99, base: "oz",    capacity: 16,  calsPerPkg: 1600 }, // 352 kcal/100g dry × 453g
  // Recipes measure canned tomatoes in cups; a 14.5 oz can holds ~1.75 cups (28 tbsp).
  // "Diced tomatoes, canned" normalizes to "tomatoes" (comma-strip + adjective-strip),
  // so an exact "tomatoes" entry is required — without it the fuzzy lookup matches
  // "cherry tomatoes" (longest substring) and prices a pint of fresh cherry tomatoes.
  "diced tomatoes":           { unit: "can (14.5 oz)",  price: 1.09, base: "tbsp",  capacity: 28 },
  "tomatoes":                 { unit: "can (14.5 oz)",  price: 1.09, base: "tbsp",  capacity: 28 },
  "crushed tomatoes":         { unit: "can (14.5 oz)",  price: 1.09, base: "tbsp",  capacity: 28 },
  "vegetable broth":          { unit: "carton (32 oz)", price: 2.49, base: "tbsp",  capacity: 64 },
  "chicken or vegetable broth":{ unit: "carton (32 oz)",price: 2.49, base: "tbsp",  capacity: 64 },
  "chicken broth":            { unit: "carton (32 oz)", price: 2.49, base: "tbsp",  capacity: 64 },
  "salsa":                    { unit: "jar (16 oz)",    price: 2.99, base: "tbsp",  capacity: 32 },
  "hummus":                   { unit: "container (10 oz)", price: 3.49, base: "tbsp", capacity: 20 },

  // ── Nuts, Seeds & Oils ──────────────────────────────────────────────────────
  "sesame oil":               { unit: "bottle (8 fl oz)", price: 3.49, base: "tbsp", capacity: 16 },
  "vegetable oil":            { unit: "bottle (48 fl oz)", price: 2.99, base: "tbsp", capacity: 96 },
  "peanut butter":            { unit: "jar (18 oz)",    price: 3.99, base: "tbsp",  capacity: 36,  calsPerPkg: 3420 }, // 190 kcal/2 tbsp × 18 servings
  "almond butter":            { unit: "jar (16 oz)",    price: 7.99, base: "tbsp",  capacity: 32 },
  "walnuts":                  { unit: "bag (8 oz)",     price: 4.99, base: "oz",    capacity: 8 },
  "chia seeds":               { unit: "bag (12 oz)",    price: 7.99, base: "tbsp",  capacity: 40 },
  "sesame seeds":             { unit: "jar (3.5 oz)",   price: 2.49, base: "tbsp",  capacity: 24 },

  // ── Condiments & Sauces ─────────────────────────────────────────────────────
  "honey":                    { unit: "bottle (12 oz)", price: 4.99, base: "tbsp",  capacity: 24 },
  "maple syrup":              { unit: "bottle (12 oz)", price: 6.99, base: "tbsp",  capacity: 24 },
  "honey mustard":            { unit: "bottle (12 oz)", price: 2.49, base: "tbsp",  capacity: 24 },
  "dijon mustard":            { unit: "jar (8 oz)",     price: 2.99, base: "tbsp",  capacity: 16 },
  "caesar dressing":          { unit: "bottle (8 oz)",  price: 2.99, base: "tbsp",  capacity: 16 },
  "mayonnaise":               { unit: "jar (15 oz)",    price: 3.49, base: "tbsp",  capacity: 30 },
  "buffalo sauce":            { unit: "bottle (12 oz)", price: 2.99, base: "tbsp",  capacity: 24 },
  "sriracha":                 { unit: "bottle (17 oz)", price: 3.49, base: "tbsp",  capacity: 34 },
  "lime juice":               { unit: "bottle (4 oz)",  price: 1.49, base: "tbsp",  capacity: 8 },
  "lemon juice":              { unit: "bottle (4 oz)",  price: 1.49, base: "tbsp",  capacity: 8 },

  // ── Spices & Herbs (non-pantry) ─────────────────────────────────────────────
  "taco seasoning":           { unit: "pkg (1 oz)",     price: 0.99, base: "tbsp",  capacity: 2 },
  "curry powder":             { unit: "jar (2 oz)",     price: 2.49, base: "tbsp",  capacity: 8 },
  "everything bagel seasoning":{ unit: "jar (3 oz)",    price: 3.49, base: "tbsp",  capacity: 12 },
  "garlic":                   { unit: "head",           price: 0.69, base: "count", capacity: 10 },
  "garlic cloves":            { unit: "head",           price: 0.69, base: "count", capacity: 10 },
  "cilantro":                 { unit: "bunch",          price: 0.89, base: "count", capacity: 1 },
  "fresh chives":             { unit: "bunch",          price: 1.49, base: "count", capacity: 1 },
  "fresh ginger":             { unit: "piece",          price: 0.99, base: "count", capacity: 1 },
  "matcha powder":            { unit: "tin (1 oz)",     price: 7.99, base: "tbsp",  capacity: 4 },
  "vanilla extract":          { unit: "bottle (2 oz)",  price: 4.99, base: "tbsp",  capacity: 4 },
  "capers":                   { unit: "jar (3.5 oz)",   price: 2.99, base: "tbsp",  capacity: 7 },
  "italian seasoning":        { unit: "jar (0.75 oz)",  price: 1.99, base: "tbsp",  capacity: 3 },
  "turmeric":                 { unit: "jar (1.7 oz)",   price: 2.49, base: "tbsp",  capacity: 8 },
  "red pepper flakes":        { unit: "jar (1.5 oz)",   price: 1.99, base: "tbsp",  capacity: 6 },
  "cornstarch":               { unit: "box (16 oz)",    price: 1.99, base: "tbsp",  capacity: 64 },
};

// ── Amount Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a recipe amount string into a numeric value in the given base unit.
 * `perCup` converts cup-measured amounts for non-tbsp bases (e.g. cups of
 * spinach → oz, cups of diced onion → onions); without it those return null.
 */
export function parseAmountInBase(amountStr: string, targetBase: BaseUnit, perCup?: number): number | null {
  const s = amountStr.trim();

  // Negligible amounts — don't add to total
  if (/^(to taste|pinch|dash|handful|few|as needed|optional)/i.test(s)) return null;

  // "N can(s) (X oz [each])" → N × X oz
  const canOz = s.match(/(\d+(?:\.\d+)?)\s*can[s]?\s*\((\d+(?:\.\d+)?)\s*oz(?:\s*each)?\)/i);
  if (canOz) {
    const oz = parseFloat(canOz[1]) * parseFloat(canOz[2]);
    return targetBase === "oz" ? oz : targetBase === "count" ? 1 : null;
  }

  // "1 small can (3 oz)" / "1 can (5 oz)" with optional prefix words
  const singleCan = s.match(/(?:small\s+|large\s+)?can\s*\((\d+(?:\.\d+)?)\s*oz\)/i);
  if (singleCan) {
    const oz = parseFloat(singleCan[1]);
    return targetBase === "oz" ? oz : targetBase === "count" ? 1 : null;
  }

  // "1 scoop (30g)" → treat as 1 count (serving)
  if (/scoop/i.test(s)) return targetBase === "count" ? 1 : null;

  // Extract leading numeric value (handles fractions and decimals)
  const num = parseLeadingNumber(s);
  if (num === null) return targetBase === "count" ? 1 : null;

  const lower = s.toLowerCase();

  // Weight
  if (/lb\b/.test(lower)) {
    const oz = num * 16;
    return targetBase === "oz" ? oz : null;
  }
  if (/\boz\b/.test(lower)) {
    return targetBase === "oz" ? num : null;
  }
  if (/\bg\b/.test(lower) && !/tbsp/.test(lower)) {
    const oz = num / 28.35;
    return targetBase === "oz" ? oz : null;
  }

  // Volume
  if (/cup/.test(lower)) {
    if (targetBase === "tbsp") return num * 16;
    return perCup ? num * perCup : null;
  }
  if (/\btbsp\b|\btablespoon/.test(lower)) {
    return targetBase === "tbsp" ? num : null;
  }
  if (/\btsp\b|\bteaspoon/.test(lower)) {
    const tbsp = num / 3;
    return targetBase === "tbsp" ? tbsp : null;
  }
  if (/\bfl\s*oz\b/.test(lower)) {
    const tbsp = num * 2;
    return targetBase === "tbsp" ? tbsp : null;
  }

  // Count: bare numbers or with unit-less qualifiers (medium, large, slices, cloves…)
  return targetBase === "count" ? num : null;
}

function parseLeadingNumber(s: string): number | null {
  // "1 1/2 ..." → mixed fraction
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);

  // "1/2 ..." → simple fraction
  const frac = s.match(/^(\d+)\/(\d+)/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);

  // "1.5 ..." or "2 ..."
  const dec = s.match(/^(\d+(?:\.\d+)?)/);
  if (dec) return parseFloat(dec[1]);

  return null;
}

// ── Purchasable Unit Lookup ────────────────────────────────────────────────────

export function lookupPurchasable(key: string): PurchasableUnitDef | null {
  if (PURCHASABLE_MAP[key]) return PURCHASABLE_MAP[key];

  // Collect every substring match from both directions, then return the one with
  // the longest map key (most specific).  Running both passes before deciding
  // prevents "broccoli" from winning over "broccoli florets" when the ingredient
  // key is "broccoli floret" — which matches "broccoli" in Pass 1 but matches
  // "broccoli florets" (the map key contains the key) in Pass 2.
  let best: { len: number; def: PurchasableUnitDef } | null = null;

  for (const [mapKey, def] of Object.entries(PURCHASABLE_MAP)) {
    const isMatch =
      (key.includes(mapKey) && mapKey.length > 4) ||   // map key inside ingredient
      (mapKey.includes(key) && key.length > 4);         // ingredient inside map key
    if (isMatch && (!best || mapKey.length > best.len)) {
      best = { len: mapKey.length, def };
    }
  }

  return best ? best.def : null;
}

// ── Pluralization ─────────────────────────────────────────────────────────────

function pluralize(unit: string): string {
  // Compound units like "bag (12 oz)" → "bags (12 oz)"
  const compound = unit.match(/^([^(]+?)\s*(\(.+)$/);
  if (compound) {
    return pluralize(compound[1].trim()) + " " + compound[2];
  }
  // Irregular or rule-based plurals
  if (unit === "loaf") return "loaves";
  if (unit === "tomato") return "tomatoes";
  if (unit === "avocado") return "avocados";
  if (unit.endsWith("ch")) return unit + "es";    // bunch → bunches
  if (unit.endsWith("x")) return unit + "es";     // box → boxes
  if (unit.endsWith("can")) return unit + "s";
  return unit + "s";
}

// ── Main Export: Compute Purchasable Quantity ─────────────────────────────────

export interface PurchasableResult {
  qty: number;          // purchasable units needed
  label: string;        // e.g. "2 lbs", "1 dozen", "1 loaf"
  pricePerUnit: number; // per-purchasable-unit price (before state multiplier)
}

export function computePurchasable(
  key: string,
  amounts: string[],
  recipeCount: number,
  stateMultiplier: number
): PurchasableResult & { total: number } {
  const def = lookupPurchasable(key);

  if (!def) {
    // Fallback: treat each recipe use as a $0.40 default unit
    const unitPrice = +(0.40 * stateMultiplier).toFixed(2);
    return {
      qty: recipeCount,
      label: recipeCount === 1 ? "1 use" : `${recipeCount} uses`,
      pricePerUnit: unitPrice,
      total: +(unitPrice * recipeCount).toFixed(2),
    };
  }

  // Sum all recipe amounts in the ingredient's base unit
  let totalBase = 0;
  let parsed = 0;
  for (const amt of amounts) {
    const v = parseAmountInBase(amt, def.base, def.perCup);
    if (v !== null) {
      totalBase += v;
      parsed++;
    }
  }

  // If none of the amounts could be parsed in the base unit, fall back to recipe count
  if (parsed === 0) totalBase = recipeCount;

  let qty = Math.max(1, Math.ceil(totalBase / def.capacity));

  // Protein powder: one 2-lb tub has ~28-30 servings — always enough for a week.
  if (key.includes("protein powder")) qty = 1;

  // Eggs: one dozen = 12 eggs; only go to 2 dozen if the plan truly needs more than 12.
  // Math.ceil already handles this correctly; guard against parsing fallback inflating count.
  if (key === "egg" && parsed === 0) {
    // recipeCount (number of uses) is not egg count — cap at 1 dozen unless we parsed real amounts
    qty = 1;
  }

  const pricePerUnit = +(def.price * stateMultiplier).toFixed(2);
  const total = +(pricePerUnit * qty).toFixed(2);

  // Build display label
  const label = qty === 1 ? `1 ${def.unit}` : `${qty} ${pluralize(def.unit)}`;

  return { qty, label, pricePerUnit, total };
}
