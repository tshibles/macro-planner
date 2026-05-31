import { NextRequest, NextResponse } from "next/server";
import { generatePlan } from "@/app/lib/generatePlan";
import { createClient } from "@/app/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { budget, goal, diets, allergies, totalDays, stateCode, numberOfPeople, calorieTarget, planSalt } = body;

  if (typeof budget !== "number" || typeof totalDays !== "number") {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  // Fetch disliked meals for authenticated users
  let dislikedIds: string[] = [];
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("meal_plans")
        .select("disliked_meal_ids")
        .eq("user_id", user.id)
        .single();
      dislikedIds = data?.disliked_meal_ids ?? [];
    }
  } catch {
    // Non-fatal: unauthenticated or missing row
  }

  const plan = generatePlan(
    budget,
    goal ?? "",
    Array.isArray(diets) ? diets : [],
    totalDays,
    stateCode ?? "",
    typeof numberOfPeople === "number" ? numberOfPeople : 1,
    calorieTarget ?? undefined,
    dislikedIds,
    typeof planSalt === "number" ? planSalt : 0,
    Array.isArray(allergies) ? allergies : []
  );
  return NextResponse.json(plan);
}
