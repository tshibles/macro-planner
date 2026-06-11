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

  const { data } = await supabase
    .from("meal_plans")
    .select(
      "budget, goal, diet, diets, tier, age, activity_level, allergies, weight_lbs, height_ft, height_in, gender, state, target_weight, goal_timeframe_weeks, plan_salt, liked_meal_ids, disliked_meal_ids"
    )
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({ plan: data ?? null });
}
