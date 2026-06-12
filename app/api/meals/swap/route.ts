import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { meals } from "@/app/data/meals";
import { MealSwap } from "@/app/lib/generatePlan";
import { generatePlanForRequest, loadUserPlanData, StoredSwaps } from "@/app/lib/planService";

const VALID_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

// Replaces the meal in one (day, slot) of the user's plan. The swap is stored
// against the plan salt, the plan is regenerated with all swaps applied, and
// the saved grocery list is updated to match (orphaned ingredients pruned,
// newly required ones bought if the budget allows).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { dayIndex, slot, newMealId, planSalt } = body;

  if (
    typeof dayIndex !== "number" ||
    !VALID_SLOTS.includes(slot) ||
    typeof newMealId !== "string" ||
    typeof planSalt !== "number" ||
    typeof body.budget !== "number" ||
    typeof body.totalDays !== "number"
  ) {
    return NextResponse.json({ error: "Missing or invalid params" }, { status: 400 });
  }

  const newMeal = meals.find((m) => m.id === newMealId);
  if (!newMeal || newMeal.type !== slot) {
    return NextResponse.json({ error: "Unknown meal for this slot" }, { status: 400 });
  }

  const userData = await loadUserPlanData(supabase, user.id);

  // Merge into the swaps stored for this salt; swaps made against another
  // salt belong to a previous plan and are discarded. The FULL day index is
  // stored so a swap made while viewing week 3 edits week 3 — not week 1.
  const existing: MealSwap[] =
    userData.savedSwaps?.salt === planSalt ? userData.savedSwaps.swaps : [];
  const swap: MealSwap = { dayIndex, slot, mealId: newMealId };
  const swaps = [...existing.filter((s) => !(s.dayIndex === swap.dayIndex && s.slot === slot)), swap];
  const storedSwaps: StoredSwaps = { salt: planSalt, swaps };

  const plan = generatePlanForRequest(
    { ...body, planSalt },
    { ...userData, savedSwaps: storedSwaps }
  );

  await supabase
    .from("meal_plans")
    .update({
      meal_swaps: storedSwaps,
      grocery_list: plan.weeklyCarts[0].items.map((i) => ({
        name: i.key,
        count: i.packages,
        unitPrice: i.pricePerUnit,
        total: i.totalCost,
      })),
    })
    .eq("user_id", user.id);

  const day = plan.days[dayIndex] ?? plan.days[dayIndex % 7];
  return NextResponse.json({ day, plan });
}
