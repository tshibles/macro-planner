import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ plan: null });
  }

  const { data, error } = await supabase
    .from("meal_plans")
    .select(
      "budget, goal, diet, diets, tier, age, activity_level, allergies, weight_lbs, height_ft, height_in, gender, state, target_weight, goal_timeframe_weeks, plan_salt, liked_meal_ids, disliked_meal_ids"
    )
    .eq("user_id", user.id)
    .single();

  // PGRST116 = no row for this user, which is a normal state; anything else
  // (e.g. a missing column, 42703) silently turns every saved plan into
  // "no plan" for every user, so it must be loud.
  if (error && error.code !== "PGRST116") {
    console.error("[meal-plans/saved] select failed:", error.code, error.message);
  }

  return NextResponse.json({ plan: data ?? null });
}
