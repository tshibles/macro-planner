// Per-serving/per-use retail price estimates for all ingredients in the meal library.
// Prices are national averages in USD; multiply by STATE_MULTIPLIERS for regional adjustment.

const PRICES: Record<string, number> = {
  // ── Proteins ─────────────────────────────────────────────────────────────
  "chicken breast": 1.50,
  "grilled chicken breast": 1.50,
  "cooked chicken breast": 1.50,
  "ground beef": 1.00,
  "ground turkey": 0.90,
  "salmon fillet": 3.00,
  "smoked salmon": 2.00,
  "canned tuna": 1.20,
  "tuna": 1.20,
  "medium shrimp": 1.50,
  "shrimp": 1.50,
  "deli turkey": 1.20,
  "sliced turkey breast": 1.20,
  "deli ham": 0.80,
  "ham": 0.80,
  "bacon strips": 0.40,
  "bacon": 0.40,
  "extra-firm tofu": 0.80,
  "tofu": 0.80,
  // ── Eggs & Dairy ─────────────────────────────────────────────────────────
  "large eggs": 0.75,
  "large egg": 0.25,
  "egg whites": 0.40,
  "plain greek yogurt": 0.80,
  "greek yogurt": 0.80,
  "low-fat cottage cheese": 0.40,
  "cottage cheese": 0.40,
  "milk": 0.20,
  "2% milk": 0.20,
  "unsweetened almond milk": 0.20,
  "almond milk": 0.20,
  "cream cheese": 0.20,
  "shredded cheddar cheese": 0.20,
  "shredded mexican cheese": 0.25,
  "shredded cheese": 0.20,
  "parmesan": 0.25,
  "feta cheese": 0.30,
  "blue cheese crumbles": 0.35,
  "swiss cheese": 0.25,
  "sour cream": 0.10,
  "butter": 0.10,
  "light coconut milk": 0.35,
  "coconut milk": 0.40,
  // ── Produce ──────────────────────────────────────────────────────────────
  "banana": 0.25,
  "ripe banana": 0.25,
  "ripe bananas": 0.50,
  "frozen banana": 0.25,
  "avocado": 1.00,
  "ripe avocado": 1.00,
  "tomato": 0.30,
  "tomato slices": 0.20,
  "diced tomato": 0.25,
  "cherry tomatoes": 0.35,
  "bell pepper": 0.60,
  "broccoli florets": 0.40,
  "broccoli": 0.40,
  "potato": 0.30,
  "potatoes": 0.30,
  "sweet potato": 0.50,
  "medium sweet potato": 0.50,
  "asparagus spears": 0.50,
  "asparagus": 0.50,
  "zucchini": 0.40,
  "kale": 0.30,
  "baby spinach": 0.25,
  "spinach": 0.25,
  "romaine lettuce": 0.20,
  "romaine or butter lettuce": 0.20,
  "cucumber": 0.50,
  "celery stalk": 0.10,
  "celery stalks": 0.15,
  "carrot": 0.15,
  "onion": 0.15,
  "red onion": 0.15,
  "green onions": 0.10,
  "mushrooms": 0.25,
  "mixed berries": 0.50,
  "frozen peas": 0.20,
  "corn": 0.20,
  "shelled edamame": 0.30,
  "kiwi": 0.50,
  "mango": 0.60,
  "lemon": 0.30,
  "mixed stir-fry vegetables": 0.40,
  "shredded cabbage": 0.15,
  "cabbage slaw mix": 0.20,
  // ── Grains & Bread ───────────────────────────────────────────────────────
  "whole wheat bread": 0.30,
  "sourdough bread": 0.40,
  "large flour tortilla": 0.25,
  "flour tortilla": 0.25,
  "corn tortillas": 0.20,
  "whole wheat bagel": 0.75,
  "pita bread": 0.40,
  "rolled oats": 0.20,
  "oat flour": 0.20,
  "whole wheat flour": 0.20,
  "cooked white rice": 0.25,
  "brown rice": 0.25,
  "cooked rice": 0.25,
  "day-old cooked rice": 0.25,
  "cooked basmati rice": 0.25,
  "basmati rice": 0.25,
  "sushi rice": 0.25,
  "cooked quinoa": 0.40,
  "quinoa": 0.40,
  "penne or rotini pasta": 0.30,
  "pasta": 0.30,
  "soba noodles": 0.40,
  "plain rice cakes": 0.20,
  "granola": 0.40,
  "whole grain cereal": 0.35,
  "croutons": 0.20,
  "nori sheets": 0.30,
  // ── Protein Supplements ──────────────────────────────────────────────────
  "vanilla protein powder": 1.00,
  "protein powder": 1.00,
  // ── Canned & Packaged ────────────────────────────────────────────────────
  "chickpeas": 0.60,
  "black beans": 0.55,
  "cannellini beans": 0.60,
  "green or brown lentils": 0.30,
  "lentils": 0.30,
  "diced tomatoes": 0.40,
  "vegetable broth": 0.30,
  "chicken or vegetable broth": 0.30,
  "chicken broth": 0.30,
  "salsa": 0.20,
  "hummus": 0.35,
  // ── Nuts, Seeds & Oils ───────────────────────────────────────────────────
  "olive oil": 0.15,
  "vegetable oil": 0.05,
  "sesame oil": 0.10,
  "peanut butter": 0.25,
  "almond butter": 0.40,
  "walnuts": 0.35,
  "chia seeds": 0.20,
  "sesame seeds": 0.05,
  // ── Condiments & Sauces ──────────────────────────────────────────────────
  "soy sauce": 0.05,
  "honey": 0.15,
  "maple syrup": 0.20,
  "honey mustard": 0.10,
  "dijon mustard": 0.05,
  "caesar dressing": 0.25,
  "mayonnaise": 0.10,
  "buffalo sauce": 0.10,
  "sriracha": 0.05,
  "rice vinegar": 0.05,
  "white vinegar": 0.02,
  "lime juice": 0.10,
  "lemon juice": 0.10,
  // ── Spices & Herbs ───────────────────────────────────────────────────────
  "taco seasoning": 0.10,
  "curry powder": 0.10,
  "everything bagel seasoning": 0.05,
  "garlic": 0.05,
  "garlic cloves": 0.05,
  "garlic powder": 0.03,
  "paprika": 0.03,
  "cumin": 0.03,
  "turmeric": 0.03,
  "cinnamon": 0.03,
  "chili powder": 0.03,
  "italian seasoning": 0.03,
  "dried oregano": 0.03,
  "red pepper flakes": 0.02,
  "salt and pepper": 0.02,
  "salt": 0.01,
  "black pepper": 0.01,
  "fresh basil": 0.20,
  "cilantro": 0.10,
  "fresh chives": 0.15,
  "fresh ginger": 0.10,
  "matcha powder": 0.30,
  "vanilla extract": 0.10,
  "cornstarch": 0.03,
  "baking powder": 0.02,
  "ice cubes": 0.01,
  "capers": 0.10,
  "water or milk": 0.05,
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // strip parentheticals: (canned), (optional), etc.
    .replace(/,.*$/, "")       // strip everything after first comma: ", diced"
    .replace(/\d+\s*(oz|lb|g|kg)\b/gi, "") // strip weight specs
    .trim();
}

export function lookupIngredientPrice(rawName: string): number {
  const norm = normalize(rawName);

  if (PRICES[norm] !== undefined) return PRICES[norm];

  // Check if any key is contained in the normalized name
  for (const [key, price] of Object.entries(PRICES)) {
    if (norm.includes(key)) return price;
  }

  // Check if the normalized name is contained in any key
  for (const [key, price] of Object.entries(PRICES)) {
    if (key.includes(norm) && norm.length > 4) return price;
  }

  // First-word fallback
  const firstWord = norm.split(" ")[0];
  if (firstWord.length > 3) {
    for (const [key, price] of Object.entries(PRICES)) {
      if (key.startsWith(firstWord)) return price;
    }
  }

  return 0.40; // default per-use cost for unrecognized ingredients
}
