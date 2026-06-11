// Meal-prep model audit for a generated multi-week plan.
// Run: npx tsx audit-prep.ts [salt]
// Mirrors the exact input mapping the app performs for:
//   $70/week, 6'0" 220lb male, very active (1.725), target 230 lbs in 12 weeks,
//   no dietary restrictions, Ohio, 30 days.
//
// Verifies the meal-prep contract:
//   1. Every full week has exactly 2 prep sessions (Sunday + Wednesday), each
//      with 2–3 batch recipes; partial weeks have sessions for the days they have.
//   2. Batch recipes repeat across exactly the days their session covers
//      (intentional repetition), and slotSources tags match.
//   3. Each week's cart EXACTLY covers the week's real, portion-scaled,
//      batch-aware ingredient requirements: a batch eaten on N days requires
//      ONE batch of ingredients (not N), every required product is bought in
//      the right package count (no under-buying, no over-buying), and the cart
//      contains nothing the week's meals don't use.
//   4. Daily calories within ±5% and protein within ±10% of the EFFECTIVE
//      per-week targets (nominal target × the budget-fit portion scale).
//   5. Costs reconcile: summed meal-card costs == cart total == weekly cost;
//      carts stay within budget or the plan honestly reports the shortfall.
//   6. Same salt → identical plan (determinism).

import { generatePlan, MealPlan, PrepSession } from "@/app/lib/generatePlan";
import { calculateTDEE, getCalorieTarget, deriveGoal } from "@/app/lib/tdee";
import { normalizeKey } from "@/app/lib/normalizeIngredient";
import { isPantryStaple, lookupPurchasable, computePurchasable, PurchasableUnitDef } from "@/app/data/purchasableUnits";
import { STATE_MULTIPLIERS } from "@/app/data/stateMultipliers";
import { meals } from "@/app/data/meals";

const productId = (price: number, unit: string) => `${price.toFixed(2)}|${unit}`;
const slots: Array<"breakfast" | "lunch" | "dinner" | "snack"> = ["breakfast", "lunch", "dinner", "snack"];

// ── Inputs (exactly as the app derives them) ─────────────────────────────────
const budget = 70;
const weightLbs = 220;
const stateCode = "OH";
const stateMultiplier = STATE_MULTIPLIERS[stateCode];
const goal = deriveGoal(weightLbs, 230); // muscle_gain
const tdee = calculateTDEE(weightLbs, 6, 0, "male", 20, 1.725);
const calorieTarget = getCalorieTarget(tdee, goal, { weightLbs, targetWeightLbs: 230, timeframeWeeks: 12 });
const salt = process.argv[2] ? parseInt(process.argv[2], 10) : 12345;

function gen(): MealPlan {
  const ow = console.warn, ol = console.log;
  console.warn = () => {}; console.log = () => {};
  try {
    return generatePlan(budget, goal, [], 30, stateCode, 1, calorieTarget, [], salt, [], weightLbs, []);
  } finally { console.warn = ow; console.log = ol; }
}

const plan = gen();
const out: string[] = [];
const p = (s = "") => out.push(s);
let failures = 0;
const fail = (s: string) => { failures++; p(`  ** FAIL: ${s}`); };

p(`INPUTS  goal=${goal} tdee=${tdee} calorieTarget=${calorieTarget} proteinTarget=${plan.proteinTarget}g salt=${salt}`);
p(`PLAN    days=${plan.days.length} weeks=${plan.numWeeks} avgCal=${plan.avgDailyCalories} avgProt=${plan.avgDailyProtein}g totalCost=$${plan.totalPlanCost}`);
p(`SCALES  portion scale per week: [${(plan.weeklyPortionScale ?? []).map((s) => s.toFixed(3)).join(", ")}]`);
p(`        full-portion cost per week: [${(plan.weeklyFullCost ?? []).map((c) => `$${c.toFixed(2)}`).join(", ")}]`);
p();

// ── Check 1: two prep sessions per full week, 2–3 recipes each ───────────────
p(`== CHECK 1: prep sessions per week ==`);
for (let w = 0; w < plan.numWeeks; w++) {
  const weekLen = plan.weeks[w].length;
  const sessions = plan.prepSessions[w] ?? [];
  const expected = weekLen > 3 ? 2 : 1; // Wednesday session only exists when the week reaches Thursday
  const names = sessions.map((s) => `${s.sessionDay}(${s.recipes.length} recipes: ${s.recipes.map((r) => `${r.slot}=${r.meal.id}`).join(" ")})`).join(" | ");
  p(`  Week ${w + 1} (${weekLen} days): ${sessions.length} sessions — ${names || "none"}`);
  if (sessions.length !== expected) fail(`week ${w + 1}: expected ${expected} sessions, got ${sessions.length}`);
  for (const s of sessions) {
    if (s.recipes.length < 2 || s.recipes.length > 3) fail(`week ${w + 1} ${s.sessionDay}: ${s.recipes.length} recipes (wanted 2–3)`);
  }
}
p();

// ── Check 2: batch recipes repeat across exactly their covered days ──────────
p(`== CHECK 2: batch repetition matches session coverage ==`);
let coveredSlotCount = 0;
for (let w = 0; w < plan.numWeeks; w++) {
  const week = plan.weeks[w];
  for (const session of plan.prepSessions[w] ?? []) {
    const segDays = session.sessionDay === "Sunday" ? [0, 1, 2] : [3, 4, 5];
    for (const r of session.recipes) {
      // every covered day serves this exact meal in this slot
      for (const dayIdx of r.coveredDayIndexes) {
        const day = plan.days[dayIdx];
        if (day[r.slot].id !== r.meal.id) fail(`week ${w + 1} ${session.sessionDay} ${r.slot}: day ${dayIdx} serves ${day[r.slot].id}, recipe is ${r.meal.id}`);
        const expectedSource = session.sessionDay === "Sunday" ? "sunday-prep" : "wednesday-prep";
        if (day.slotSources[r.slot] !== expectedSource) fail(`week ${w + 1} day ${dayIdx} ${r.slot}: slotSource=${day.slotSources[r.slot]}, expected ${expectedSource}`);
        coveredSlotCount++;
      }
      // coverage spans the whole segment present in this week
      const expectedCover = segDays.filter((d) => d < week.length).length;
      if (r.coveredDayIndexes.length !== expectedCover)
        fail(`week ${w + 1} ${session.sessionDay} ${r.slot} "${r.meal.id}": covers ${r.coveredDayIndexes.length} days, segment has ${expectedCover}`);
      if (r.servingsToCook !== r.coveredDayIndexes.length)
        fail(`week ${w + 1} ${r.meal.id}: servingsToCook=${r.servingsToCook} != covered days ${r.coveredDayIndexes.length}`);
      const base = meals.find((m) => m.id === r.meal.id)!;
      if (base.prepType !== "batch") fail(`week ${w + 1} ${r.meal.id}: prep recipe is not a batch meal`);
      if (!r.storageInstructions || !r.reheatInstructions) fail(`week ${w + 1} ${r.meal.id}: missing storage/reheat instructions`);
    }
  }
  // Sunday (day 7 of full weeks) must be fully fresh
  if (week.length === 7) {
    const sunday = week[6];
    for (const slot of slots) {
      if (sunday.slotSources[slot] !== "fresh") fail(`week ${w + 1} Sunday ${slot}: tagged ${sunday.slotSources[slot]}, expected fresh`);
    }
  }
}
p(`  ${coveredSlotCount} batch-covered day-slots verified; Sundays all-fresh`);
p();

// ── Check 3: cart exactly covers scaled batch-aware requirements ─────────────
// Independently re-aggregates each week's requirements from the plan itself —
// each prep recipe's whole-batch ingredients ONCE, fresh day-slots per day —
// then converts through computePurchasable (the canonical retail converter)
// and demands the cart match package-for-package. Catches UNDER-buying (the
// day-one-out-of-eggs bug) as much as over-buying.
p(`== CHECK 3: cart packages exactly match scaled batch+fresh requirements ==`);
interface ReqProduct { key: string; def: PurchasableUnitDef; amounts: string[] }
const KEY_QUANTITIES: Record<string, string> = {}; // week1 egg/turkey/potato, for reporting
for (let w = 0; w < plan.numWeeks; w++) {
  const week = plan.weeks[w];
  const required = new Map<string, ReqProduct>();
  const addReq = (item: string, amount: string) => {
    const key = normalizeKey(item);
    if (isPantryStaple(key)) return;
    const def = lookupPurchasable(key);
    if (!def) return; // unknown ingredient — generator never buys these either
    const id = productId(def.price, def.unit);
    if (!required.has(id)) required.set(id, { key, def, amounts: [] });
    required.get(id)!.amounts.push(amount);
  };
  const batchCovered = new Set<string>(); // `${dayIndex}|${slot}`
  for (const session of plan.prepSessions[w] ?? []) {
    for (const r of session.recipes) {
      for (const ing of r.batchIngredients) addReq(ing.item, ing.amount);
      for (const d of r.coveredDayIndexes) batchCovered.add(`${d}|${r.slot}`);
    }
  }
  for (const day of week) {
    for (const slot of slots) {
      if (batchCovered.has(`${day.dayIndex}|${slot}`)) continue;
      for (const ing of day[slot].ingredients) addReq(ing.item, ing.amount);
    }
  }

  const cart = plan.weeklyCarts[w];
  const cartByProduct = new Map(cart.items.map((i) => {
    const def = lookupPurchasable(i.key);
    return [def ? productId(def.price, def.unit) : i.key, i] as const;
  }));

  let exact = 0;
  for (const [id, req] of Array.from(required.entries())) {
    const expected = computePurchasable(req.key, req.amounts, req.amounts.length, stateMultiplier);
    const item = cartByProduct.get(id);
    if (!item) { fail(`week ${w + 1}: required product "${req.key}" [${id}] missing from cart (needs ${expected.qty} pkg)`); continue; }
    if (item.packages < expected.qty)
      fail(`week ${w + 1}: UNDER-BOUGHT "${req.key}" — cart has ${item.packages} pkg, scaled requirement is ${expected.qty} (${expected.label})`);
    else if (item.packages > expected.qty)
      fail(`week ${w + 1}: OVER-BOUGHT "${req.key}" — cart has ${item.packages} pkg, scaled requirement is ${expected.qty}`);
    else exact++;
    if (Math.abs(item.totalCost - expected.total) > 0.005)
      fail(`week ${w + 1}: "${req.key}" cart cost $${item.totalCost} != requirement cost $${expected.total}`);
    if (w === 0 && ["egg", "ground turkey", "potato"].some((k) => req.key.includes(k)))
      KEY_QUANTITIES[req.key] = `${item.purchaseLabel} (need ${expected.qty}, cart ${item.packages})`;
  }
  for (const [id, item] of Array.from(cartByProduct.entries())) {
    if (!required.has(id)) fail(`week ${w + 1}: cart item "${item.key}" [${id}] is not used by any of this week's meals`);
  }
  p(`  Week ${w + 1}: ${required.size} products required, ${exact}/${required.size} exact package matches, ${cart.items.length} cart items`);
}
p(`  Week 1 key quantities: ${Object.entries(KEY_QUANTITIES).map(([k, v]) => `${k} = ${v}`).join("; ") || "(none)"}`);
p();

// ── Check 4: daily calorie/protein vs EFFECTIVE (budget-scaled) targets ──────
const proteinTarget = plan.proteinTarget!;
p(`== CHECK 4: daily calories ±5% and protein ±10% of effective per-week targets ==`);
for (let w = 0; w < plan.numWeeks; w++) {
  const scale = plan.weeklyPortionScale?.[w] ?? 1;
  const effCal = calorieTarget * scale;
  const effProt = proteinTarget * scale;
  let calPass = 0, proPass = 0;
  for (const day of plan.weeks[w]) {
    const calDev = Math.abs(day.dailyCalories - effCal) / effCal;
    const proDev = Math.abs(day.dailyProtein - effProt) / effProt;
    if (calDev <= 0.05) calPass++; else fail(`week ${w + 1} ${day.day}: ${day.dailyCalories} cal (${(calDev * 100).toFixed(1)}% off effective ${Math.round(effCal)})`);
    if (proDev <= 0.10) proPass++; else fail(`week ${w + 1} ${day.day}: ${day.dailyProtein}g protein (${(proDev * 100).toFixed(1)}% off effective ${Math.round(effProt)}g)`);
  }
  const n = plan.weeks[w].length;
  p(`  Week ${w + 1} (scale ${scale.toFixed(3)} → ${Math.round(effCal)} cal / ${Math.round(effProt)}g): calories ${calPass}/${n}, protein ${proPass}/${n}`);
}
if ((plan.weeklyPortionScale ?? []).some((s) => s < 0.995) && !plan.budgetCapMessage)
  fail(`portions were scaled below 100% but no budgetCapMessage explains the tradeoff`);
p();

// ── Check 5: cost reconciliation & budget honesty ─────────────────────────────
p(`== CHECK 5: meal-card costs == cart total == weekly cost; budget honesty ==`);
for (let w = 0; w < plan.numWeeks; w++) {
  const cart = plan.weeklyCarts[w];
  const mealCostSum = +plan.weeks[w]
    .reduce((s, day) => s + slots.reduce((t, slot) => t + day[slot].cost, 0), 0)
    .toFixed(2);
  const dayCostSum = +plan.weeks[w].reduce((s, day) => s + day.dailyCost, 0).toFixed(2);
  if (Math.abs(mealCostSum - cart.totalCost) > 0.011)
    fail(`week ${w + 1}: meal-card costs sum to $${mealCostSum} but cart total is $${cart.totalCost}`);
  if (Math.abs(dayCostSum - cart.totalCost) > 0.011)
    fail(`week ${w + 1}: day costs sum to $${dayCostSum} but cart total is $${cart.totalCost}`);
  const itemSum = +cart.items.reduce((s, i) => s + i.totalCost, 0).toFixed(2);
  if (Math.abs(itemSum - cart.totalCost) > 0.005)
    fail(`week ${w + 1}: cart items sum to $${itemSum} but totalCost says $${cart.totalCost}`);
  if (cart.totalCost > budget + 0.005 && !plan.budgetCapMessage)
    fail(`week ${w + 1}: cart $${cart.totalCost} exceeds $${budget} budget with no honest budgetCapMessage`);
  p(`  Week ${w + 1}: cart $${cart.totalCost.toFixed(2)} (${(100 * cart.totalCost / budget).toFixed(0)}% of budget) | meals $${mealCostSum} | days $${dayCostSum}`);
}
if (plan.weeklyEstimatedCost !== plan.weeklyCarts[0].totalCost)
  fail(`weeklyEstimatedCost $${plan.weeklyEstimatedCost} != week 1 cart $${plan.weeklyCarts[0].totalCost}`);
const cartSum = +plan.weeklyCarts.reduce((s, c) => s + c.totalCost, 0).toFixed(2);
if (Math.abs(cartSum - plan.totalPlanCost) > 0.005)
  fail(`totalPlanCost $${plan.totalPlanCost} != sum of weekly carts $${cartSum}`);
p(`  weeklyEstimatedCost=$${plan.weeklyEstimatedCost} totalPlanCost=$${plan.totalPlanCost}`);
p(`  budgetCapMessage: ${plan.budgetCapMessage ?? "(none)"}`);
p();

// ── Check 6: determinism ─────────────────────────────────────────────────────
const plan2 = gen();
const sig = (pl: MealPlan) => JSON.stringify({
  m: pl.days.map((d) => slots.map((s) => `${d[s].id}:${d[s].portionMultiplier}:${d[s].cost}`)),
  c: pl.weeklyCarts.map((c) => c.items.map((i) => `${i.key}x${i.packages}@${i.totalCost}`)),
  s: pl.prepSessions.map((ws: PrepSession[]) => ws.map((x) => x.recipes.map((r) => r.meal.id))),
});
p(`== CHECK 6: determinism (same salt twice) ==`);
if (sig(plan) === sig(plan2)) p(`  identical plans — deterministic`);
else fail(`same salt produced different plans`);
p();

p(failures === 0 ? `ALL CHECKS PASSED` : `${failures} FAILURES`);
console.log(out.join("\n"));
process.exit(failures === 0 ? 0 : 1);
