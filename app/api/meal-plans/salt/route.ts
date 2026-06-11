import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// Persists the plan salt (with the params it belongs to) so paid users get the
// exact same plan regenerated on return visits.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { salt, budget, goal, diets, tier, targetWeight, goalTimeframe } = body;

  if (typeof salt !== "number" || !Number.isFinite(salt)) {
    return NextResponse.json({ error: "Missing salt" }, { status: 400 });
  }

  const dietsArr: string[] = Array.isArray(diets) ? diets : [];

  await supabase.from("meal_plans").upsert(
    {
      user_id: user.id,
      budget: parseFloat(String(budget || 50)),
      goal: goal || "",
      diet: dietsArr[0] ?? "",
      diets: dietsArr,
      tier: tier || "free",
      plan_salt: Math.floor(salt),
      target_weight: targetWeight != null && targetWeight !== "" ? parseFloat(String(targetWeight)) : null,
      goal_timeframe_weeks: goalTimeframe != null && goalTimeframe !== "" ? parseInt(String(goalTimeframe)) : null,
    },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ success: true });
}
