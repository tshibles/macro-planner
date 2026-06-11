import { createClient } from "@/app/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Service-role client bypasses RLS — only used server-side in this route.
function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("free_trial_used")
    .eq("id", user.id)
    .single();

  if (profile?.free_trial_used) {
    return NextResponse.json(
      { error: "Free trial already used" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const {
    budget = 50,
    goal = "",
    diets = [],
    age = null,
    activityLevel = null,
    allergies = null,
    weight = null,
    heightFt = null,
    heightIn = null,
    gender = null,
    state = null,
    targetWeight = null,
    goalTimeframe = null,
  } = body;

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, free_trial_used: true }, { onConflict: "id" });

  if (error) {
    return NextResponse.json(
      { error: "Failed to record trial" },
      { status: 500 }
    );
  }

  // free_trial_used stays true permanently; this row is what actually grants
  // 7 days of access via the subscriptions status check.
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error: subError } = await adminClient()
    .from("subscriptions")
    .insert({
      user_id: user.id,
      plan_tier: "free",
      plan_expires_at: expiresAt,
    });

  if (subError) {
    return NextResponse.json(
      { error: "Failed to activate trial access" },
      { status: 500 }
    );
  }

  const dietsArr: string[] = Array.isArray(diets) ? diets : [];

  await supabase.from("meal_plans").upsert(
    {
      user_id: user.id,
      budget: parseFloat(String(budget)),
      goal,
      diet: dietsArr[0] ?? "",
      diets: dietsArr,
      tier: "free",
      age: age != null ? parseInt(String(age)) : null,
      activity_level: activityLevel != null ? parseFloat(String(activityLevel)) : null,
      allergies: allergies || null,
      weight_lbs: weight != null ? parseFloat(String(weight)) : null,
      height_ft: heightFt != null ? parseInt(String(heightFt)) : null,
      height_in: heightIn != null ? parseInt(String(heightIn)) : null,
      gender: gender || null,
      state: state || null,
      target_weight: targetWeight != null ? parseFloat(String(targetWeight)) : null,
      goal_timeframe_weeks: goalTimeframe != null ? parseInt(String(goalTimeframe)) : null,
    },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ success: true });
}
