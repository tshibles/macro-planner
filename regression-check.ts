// Regression sweep across user profiles after the protein-target fix.
import { generatePlan } from "@/app/lib/generatePlan";

function summarize(label: string, fn: () => ReturnType<typeof generatePlan>) {
  try {
    const plan = fn();
    const calT = plan.calorieTarget;
    const proT = plan.proteinTarget;
    let calPass = 0, proPass = 0;
    for (const d of plan.days) {
      if (!calT || Math.abs(d.dailyCalories - calT) / calT <= 0.05) calPass++;
      if (!proT || Math.abs(d.dailyProtein - proT) / proT <= 0.10) proPass++;
    }
    const over = plan.weeklyCarts.filter((c) => c.totalCost > 70.0001).length;
    const sum = +plan.weeklyCarts.reduce((s, c) => s + c.totalCost, 0).toFixed(2);
    const uniq = (slot: "breakfast" | "lunch" | "dinner" | "snack") => new Set(plan.days.map((d) => d[slot].id)).size;
    console.error(
      `${label}: days=${plan.days.length} cal ${calPass}/${plan.days.length} pro ${proPass}/${plan.days.length}` +
        ` avgCal=${plan.avgDailyCalories}/${calT ?? "-"} avgPro=${plan.avgDailyProtein}/${proT ?? "-"}` +
        ` cartsOverBudget=${over} costSum=${sum}==${plan.totalPlanCost} uniq=[${uniq("breakfast")},${uniq("lunch")},${uniq("dinner")},${uniq("snack")}]` +
        ` fallback=${plan.cartFallbackUsed ?? false} capMsg=${plan.budgetCapMessage ? "yes" : "no"}`
    );
  } catch (e) {
    console.error(`${label}: THREW — ${(e as Error).message}`);
  }
}

// Audited scenario across salts.
for (const salt of [0, 1, 777, 424242]) {
  summarize(`muscle_gain $70 OH salt=${salt}`, () =>
    generatePlan(70, "muscle_gain", [], 30, "OH", 1, 3946, [], salt, [], 220, []));
}
// Legacy: no body metrics at all (no calorie target, no weight) — old path.
summarize("legacy no-metrics $50 7d", () => generatePlan(50, "muscle_gain", [], 7, "OH", 1, undefined, [], 42, [], undefined, []));
// Fat loss: 5'6" 180lb female-ish targets, 2000 kcal, 90g protein (0.5 g/lb).
summarize("fat_loss $60 CA 30d", () => generatePlan(60, "fat_loss", [], 30, "CA", 1, 2000, [], 42, [], 180, []));
// Maintenance moderate.
summarize("maintenance $55 TX 7d", () => generatePlan(55, "maintenance", [], 7, "TX", 1, 2600, [], 7, [], 170, []));
// Vegan tight budget with protein target.
summarize("vegan fat_loss $40 OH 7d", () => generatePlan(40, "fat_loss", ["vegan"], 7, "OH", 1, 1800, [], 9, [], 150, []));
