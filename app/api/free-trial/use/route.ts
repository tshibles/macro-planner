import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

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
    diet = "",
    weight = null,
    heightFt = null,
    heightIn = null,
    gender = null,
    state = null,
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

  await supabase.from("meal_plans").upsert(
    {
      user_id: user.id,
      budget: parseFloat(String(budget)),
      goal,
      diet,
      tier: "free",
      weight_lbs: weight != null ? parseFloat(String(weight)) : null,
      height_ft: heightFt != null ? parseInt(String(heightFt)) : null,
      height_in: heightIn != null ? parseInt(String(heightIn)) : null,
      gender: gender || null,
      state: state || null,
    },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ success: true });
}
