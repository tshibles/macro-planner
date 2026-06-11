// Correctness audit harness for a generated multi-week plan.
// Run: npx tsx audit-plan.ts [salt]
// Mirrors the exact input mapping the app performs for:
//   $70/week, 6'0" 220lb male, very active (1.725), target 230 lbs in 12 weeks,
//   no dietary restrictions, Ohio.

import { generatePlan, MealPlan, DayMeals, Meal } from "@/app/lib/generatePlan";
import { calculateTDEE, getCalorieTarget, deriveGoal } from "@/app/lib/tdee";
import { normalizeKey } from "@/app/lib/normalizeIngredient";
import { isPantryStaple, lookupPurchasable } from "@/app/data/purchasableUnits";

const productId = (price: number, unit: string) => `${price.toFixed(2)}|${unit}`;

// ── Inputs (exactly as the app derives them) ─────────────────────────────────
const budget = 70;
const weightLbs = 220;
const targetWeightLbs = 230;
const timeframeWeeks = 12;
const heightFt = 6, heightIn = 0;
const gender = "male";
const activityLevel = 1.725; // "Very Active"
const age = 20;              // app default when age not provided
const diets: string[] = [];
const stateCode = "OH";
const totalDays = 30;

const goal = deriveGoal(weightLbs, targetWeightLbs); // muscle_gain
const tdee = calculateTDEE(weightLbs, heightFt, heightIn, gender, age, activityLevel);
const calorieTarget = getCalorieTarget(tdee, goal, { weightLbs, targetWeightLbs, timeframeWeeks });

const salt = process.argv[2] ? parseInt(process.argv[2], 10) : 12345;

// Capture generator warnings (safety nets, starved pools) for the report.
const genWarnings: string[] = [];
const origWarn = console.warn, origLog = console.log;
console.warn = (...a: unknown[]) => { genWarnings.push(a.join(" ")); };
console.log = () => {};
let plan: MealPlan;
try {
  plan = generatePlan(budget, goal, diets, totalDays, stateCode, 1, calorieTarget, [], salt, [], weightLbs, []);
} finally {
  console.warn = origWarn;
  console.log = origLog;
}

const slots: Array<"breakfast" | "lunch" | "dinner" | "snack"> = ["breakfast", "lunch", "dinner", "snack"];
const out: string[] = [];
const p = (s = "") => out.push(s);

p(`INPUTS  goal=${goal} tdee=${tdee} calorieTarget=${calorieTarget} proteinTarget(plan)=${plan.proteinTarget ?? "n/a"} salt=${salt}`);
p(`PLAN    totalDays=${plan.totalDays} days.length=${plan.days.length} numWeeks=${plan.numWeeks} weeklyCarts=${plan.weeklyCarts.length}`);
p(`        avgDailyCalories=${plan.avgDailyCalories} avgDailyProtein=${plan.avgDailyProtein} weeklyEstimatedCost=${plan.weeklyEstimatedCost} totalPlanCost=${plan.totalPlanCost}`);
p(`        cartFallbackUsed=${plan.cartFallbackUsed ?? false} budgetCapMessage=${plan.budgetCapMessage ?? "none"}`);
if (genWarnings.length) { p(`GENERATOR WARNINGS:`); genWarnings.forEach(w => p(`  ${w}`)); }
p();

// ── Check 1: every meal's non-pantry ingredients in that week's cart ─────────
p(`== CHECK 1: meal ingredients vs that week's cart ==`);
for (let w = 0; w < plan.weeks.length; w++) {
  const cart = plan.weeklyCarts[w];
  const cartProducts = new Set<string>();
  const cartKeys = new Set<string>();
  for (const item of cart.items) {
    cartKeys.add(item.key);
    const def = lookupPurchasable(item.key);
    if (def) cartProducts.add(productId(def.price, def.unit));
  }
  let missingCount = 0, unknownCount = 0;
  const missingLines = new Set<string>();
  const unknownLines = new Set<string>();
  for (const day of plan.weeks[w]) {
    for (const slot of slots) {
      const meal: Meal = day[slot];
      for (const ing of meal.ingredients) {
        const key = normalizeKey(ing.item);
        if (isPantryStaple(key)) continue;
        const def = lookupPurchasable(key);
        if (!def) {
          unknownCount++;
          unknownLines.add(`    [unknown ingredient] week ${w + 1} ${slot} "${meal.name}" (${meal.id}): "${ing.item}" -> key "${key}" has no purchasable def (cannot be in any cart)`);
          continue;
        }
        if (!cartProducts.has(productId(def.price, def.unit))) {
          missingCount++;
          missingLines.add(`    [MISSING] week ${w + 1} ${slot} "${meal.name}" (${meal.id}): "${ing.item}" -> key "${key}" (${def.unit} @ $${def.price}) not in week ${w + 1} cart`);
        }
      }
    }
  }
  p(`  Week ${w + 1}: cart items=${cart.items.length} | missing-from-cart ingredient instances=${missingCount} | unknown(unpurchasable)=${unknownCount}`);
  [...missingLines].sort().forEach(l => p(l));
  [...unknownLines].sort().forEach(l => p(l));
}
p();

// ── Check 2: unique meals per slot across full plan + repeats ────────────────
p(`== CHECK 2: uniqueness per slot across all ${plan.days.length} days ==`);
for (const slot of slots) {
  const ids = plan.days.map(d => d[slot].id);
  const uniq = new Set(ids);
  const counts = new Map<string, number>();
  ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
  const repeated = [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  p(`  ${slot}: servings=${ids.length} unique=${uniq.size} repeats=${ids.length - uniq.size}` +
    (repeated.length ? ` | repeated meals: ${repeated.map(([id, c]) => `${id}x${c}`).join(", ")}` : ""));
}
p();

// ── Check 3: weekly cart totals vs budget ────────────────────────────────────
p(`== CHECK 3: weekly cart totals vs $${budget} budget ==`);
plan.weeklyCarts.forEach((c, w) => {
  const itemSum = +c.items.reduce((s, i) => s + i.totalCost, 0).toFixed(2);
  const flag = c.totalCost > budget ? "  ** OVER BUDGET **" : "";
  const sumFlag = Math.abs(itemSum - c.totalCost) > 0.005 ? `  ** itemSum ${itemSum} != totalCost **` : "";
  p(`  Week ${w + 1}: totalCost=$${c.totalCost.toFixed(2)} (sum of items=$${itemSum.toFixed(2)}) utilization=${(100 * c.totalCost / budget).toFixed(1)}%${flag}${sumFlag}`);
});
p();

// ── Check 4: daily calories ±5%, daily protein ±10% ──────────────────────────
const proteinTarget = plan.proteinTarget ?? Math.round(weightLbs * 0.85);
p(`== CHECK 4: daily calories within 5% of ${calorieTarget}, protein within 10% of ${proteinTarget}g ==`);
for (let w = 0; w < plan.weeks.length; w++) {
  let calPass = 0, proPass = 0;
  const fails: string[] = [];
  for (const day of plan.weeks[w]) {
    const calDev = (day.dailyCalories - calorieTarget) / calorieTarget;
    const proDev = (day.dailyProtein - proteinTarget) / proteinTarget;
    const calOk = Math.abs(calDev) <= 0.05;
    const proOk = Math.abs(proDev) <= 0.10;
    if (calOk) calPass++; if (proOk) proPass++;
    if (!calOk || !proOk) {
      fails.push(`    day ${day.dayIndex + 1} (${day.day}): cals=${day.dailyCalories} (${(calDev * 100).toFixed(1)}%)${calOk ? "" : " CAL-FAIL"}; protein=${day.dailyProtein}g (${(proDev * 100).toFixed(1)}%)${proOk ? "" : " PRO-FAIL"}`);
    }
  }
  const n = plan.weeks[w].length;
  p(`  Week ${w + 1}: calories ${calPass}/${n} days within 5%; protein ${proPass}/${n} days within 10%`);
  fails.forEach(f => p(f));
}
p();

// ── Check 5: same meal twice in the same slot within one week ────────────────
p(`== CHECK 5: intra-week repeats (same meal, same slot, same week) ==`);
let anyIntra = false;
for (let w = 0; w < plan.weeks.length; w++) {
  for (const slot of slots) {
    const counts = new Map<string, { n: number; name: string }>();
    for (const day of plan.weeks[w]) {
      const m = day[slot];
      const e = counts.get(m.id) || { n: 0, name: m.name };
      e.n++; counts.set(m.id, e);
    }
    for (const [id, { n, name }] of counts) {
      if (n > 1) { anyIntra = true; p(`  ** Week ${w + 1} ${slot}: "${name}" (${id}) appears ${n} times **`); }
    }
  }
}
if (!anyIntra) p(`  none — no meal repeats within any single week for the same slot`);
p();

// ── Check 6: sum of weekly carts == totalPlanCost ────────────────────────────
const cartSum = +plan.weeklyCarts.reduce((s, c) => s + c.totalCost, 0).toFixed(2);
p(`== CHECK 6: weekly cart sum vs totalPlanCost ==`);
p(`  weekly totals: ${plan.weeklyCarts.map((c, i) => `W${i + 1}=$${c.totalCost.toFixed(2)}`).join("  ")}`);
p(`  sum=$${cartSum.toFixed(2)}  reported totalPlanCost=$${plan.totalPlanCost.toFixed(2)}  ${Math.abs(cartSum - plan.totalPlanCost) <= 0.005 ? "MATCH" : "** MISMATCH **"}`);

origLog(out.join("\n"));
