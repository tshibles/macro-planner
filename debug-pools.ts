// Debug: show the full (pre-prune) cart and cart-eligible pool per slot.
import { generatePlan } from "@/app/lib/generatePlan";
import { meals } from "@/app/data/meals";
import { normalizeKey } from "@/app/lib/normalizeIngredient";
import { isPantryStaple, lookupPurchasable } from "@/app/data/purchasableUnits";

// Reconstruct the union of all weekly carts ≈ products ever purchased.
const plan = generatePlan(70, "muscle_gain", [], 30, "OH", 1, 3946, [], 12345, [], 220, []);
const products = new Set<string>();
const keys = new Set<string>();
for (const cart of plan.weeklyCarts) {
  for (const item of cart.items) {
    keys.add(item.key);
    const def = lookupPurchasable(item.key);
    if (def) products.add(`${def.price.toFixed(2)}|${def.unit}`);
  }
}
console.error("UNION CART KEYS:", [...keys].sort().join(", "));

for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) {
  const eligible = meals.filter(
    (m) =>
      m.type === slot &&
      m.ingredients.every((ing) => {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key)) return true;
        const def = lookupPurchasable(key);
        return !def || products.has(`${def.price.toFixed(2)}|${def.unit}`);
      })
  );
  console.error(
    `${slot} eligible (${eligible.length}): ` +
      eligible
        .map((m) => `${m.id}(${(((m.protein * 4) / m.calories) * 100).toFixed(0)}%)`)
        .join(" ")
  );
}
