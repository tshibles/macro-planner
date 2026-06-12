import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// Persists the full preference set from the onboarding/settings forms (and
// optionally a fresh plan salt, for "Update Preferences & Regenerate").
// Additive companion to the salt and grocery-save routes, which only write
// subsets of these columns.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    salt = null,
    numberOfPeople = null,
    budget = 50,
    goal = "",
    diets = [],
    tier = "free",
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

  const dietsArr: string[] = Array.isArray(diets) ? diets : [];

  const row: Record<string, unknown> = {
    user_id: user.id,
    budget: parseFloat(String(budget || 50)),
    goal: goal || "",
    diet: dietsArr[0] ?? "",
    diets: dietsArr,
    tier: tier || "free",
    age: age != null && age !== "" ? parseInt(String(age)) : null,
    activity_level:
      activityLevel != null && activityLevel !== ""
        ? parseFloat(String(activityLevel))
        : null,
    allergies: allergies || null,
    weight_lbs:
      weight != null && weight !== "" ? parseFloat(String(weight)) : null,
    height_ft:
      heightFt != null && heightFt !== "" ? parseInt(String(heightFt)) : null,
    height_in:
      heightIn != null && heightIn !== "" ? parseInt(String(heightIn)) : null,
    gender: gender || null,
    state: state || null,
    target_weight:
      targetWeight != null && targetWeight !== ""
        ? parseFloat(String(targetWeight))
        : null,
    goal_timeframe_weeks:
      goalTimeframe != null && goalTimeframe !== ""
        ? parseInt(String(goalTimeframe))
        : null,
  };
  // Only touch plan_salt when a new one is supplied — onboarding saves
  // preferences without disturbing an existing salt.
  if (typeof salt === "number" && Number.isFinite(salt)) {
    row.plan_salt = Math.floor(salt);
  }

  const { error } = await supabase
    .from("meal_plans")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    console.error("[meal-plans/preferences] upsert failed:", error.code, error.message);
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 }
    );
  }

  // number_of_people lives in a newer migration (20260612) — write it
  // separately and best-effort so the main preference save never fails on a
  // database where that column doesn't exist yet.
  if (numberOfPeople != null && numberOfPeople !== "") {
    const n = parseInt(String(numberOfPeople));
    if (Number.isFinite(n) && n >= 1) {
      const { error: peopleError } = await supabase
        .from("meal_plans")
        .update({ number_of_people: n })
        .eq("user_id", user.id);
      if (peopleError && peopleError.code !== "42703") {
        console.error("[meal-plans/preferences] people update failed:", peopleError.code, peopleError.message);
      }
    }
  }

  return NextResponse.json({ success: true });
}
