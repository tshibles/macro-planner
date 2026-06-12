import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

const BASE_COLUMNS =
  "budget, goal, diet, diets, tier, age, activity_level, allergies, weight_lbs, height_ft, height_in, gender, state, target_weight, goal_timeframe_weeks, plan_salt, liked_meal_ids, disliked_meal_ids";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ plan: null });
  }

  // number_of_people is the newest column (20260612 migration). Select it,
  // but fall back to the base column set on 42703 (undefined column) so the
  // app keeps working on databases where the migration hasn't run yet —
  // a missing column must never turn every saved plan into "no plan".
  let { data, error } = await supabase
    .from("meal_plans")
    .select(`${BASE_COLUMNS}, number_of_people`)
    .eq("user_id", user.id)
    .single();

  if (error && error.code === "42703") {
    ({ data, error } = await supabase
      .from("meal_plans")
      .select(BASE_COLUMNS)
      .eq("user_id", user.id)
      .single());
  }

  // PGRST116 = no row for this user, which is a normal state; anything else
  // silently turns every saved plan into "no plan" for every user, so it
  // must be loud.
  if (error && error.code !== "PGRST116") {
    console.error("[meal-plans/saved] select failed:", error.code, error.message);
  }

  return NextResponse.json({ plan: data ?? null });
}
