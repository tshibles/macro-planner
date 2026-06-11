// Verify: different salts → meaningfully different meal selections, all
// still inside the per-day bands (±5% calories, ±10% protein — same bands
// as regression-check.ts). Also: same salt twice → identical plan.
import { generatePlan } from "@/app/lib/generatePlan";

const SALTS = [0, 12345, 987654];

// Profile matching the protein-target path: weight provided, calorie target set.
const make = (salt: number) =>
  generatePlan(70, "muscle_gain", [], 14, "CA", 1, 2400, [], salt, [], 180);

function slotIds(plan: ReturnType<typeof generatePlan>): string[] {
  return plan.days.flatMap((d) => [d.breakfast.id, d.lunch.id, d.dinner.id, d.snack.id]);
}

const plans = SALTS.map(make);

// ── Determinism: same salt → same plan ──────────────────────────────────────
const repeat = make(SALTS[1]);
const deterministic = JSON.stringify(slotIds(repeat)) === JSON.stringify(slotIds(plans[1]));

// ── Divergence: pairwise slot-level difference ───────────────────────────────
console.log("\n════ Salt divergence ════");
for (let a = 0; a < SALTS.length; a++) {
  for (let b = a + 1; b < SALTS.length; b++) {
    const ia = slotIds(plans[a]), ib = slotIds(plans[b]);
    const diff = ia.filter((id, i) => id !== ib[i]).length;
    console.log(`salt ${SALTS[a]} vs ${SALTS[b]}: ${diff}/${ia.length} slots differ (${Math.round((100 * diff) / ia.length)}%)`);
  }
}

// Distinct meals used per plan (variety sanity)
for (let i = 0; i < SALTS.length; i++) {
  console.log(`salt ${SALTS[i]}: ${new Set(slotIds(plans[i])).size} distinct meals across ${slotIds(plans[i]).length} slots`);
}

// ── Bands: every day within ±5% cal / ±10% protein ──────────────────────────
console.log("\n════ Target bands ════");
let allPass = true;
for (let i = 0; i < SALTS.length; i++) {
  const plan = plans[i];
  const calT = plan.calorieTarget!, proT = plan.proteinTarget!;
  let calPass = 0, proPass = 0;
  for (const d of plan.days) {
    if (Math.abs(d.dailyCalories - calT) / calT <= 0.05) calPass++;
    if (Math.abs(d.dailyProtein - proT) / proT <= 0.10) proPass++;
  }
  const n = plan.days.length;
  console.log(
    `salt ${SALTS[i]}: cal ${calPass}/${n} in ±5% (avg ${plan.avgDailyCalories}/${calT}), ` +
    `protein ${proPass}/${n} in ±10% (avg ${plan.avgDailyProtein}/${proT}g)`
  );
  if (calPass < n || proPass < n) allPass = false;
}

const minDiff = Math.min(
  ...plans.flatMap((p, a) =>
    plans.slice(a + 1).map((q) => slotIds(p).filter((id, i) => id !== slotIds(q)[i]).length)
  )
);
console.log(`\ndeterminism (same salt twice): ${deterministic ? "PASS" : "FAIL"}`);
console.log(`divergence (min pairwise slot diff ≥ 25%): ${minDiff >= slotIds(plans[0]).length * 0.25 ? "PASS" : "FAIL"} (${minDiff} slots)`);
console.log(`bands (all days in band, all salts): ${allPass ? "PASS" : "FAIL"}`);
