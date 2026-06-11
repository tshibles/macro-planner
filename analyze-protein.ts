// One-off analysis: protein density distribution of the meal catalog.
import { meals } from "@/app/data/meals";

const slots = ["breakfast", "lunch", "dinner", "snack"] as const;
for (const slot of slots) {
  const ms = meals.filter((m) => m.type === slot);
  const ratios = ms
    .map((m) => ({ id: m.id, name: m.name, cal: m.calories, p: m.protein, ratio: (m.protein * 4) / m.calories }))
    .sort((a, b) => a.ratio - b.ratio);
  console.log(`\n${slot} (${ms.length} meals) — protein-cal ratio (target ~0.19):`);
  for (const r of ratios) {
    console.log(`  ${r.id.padEnd(4)} ${(r.ratio * 100).toFixed(1).padStart(5)}%  ${r.p}g/${r.cal}cal  ${r.name}`);
  }
}
