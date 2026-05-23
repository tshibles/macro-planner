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

  const body = await req.json().catch(() => ({}));
  const {
    budget, goal, diet, tier,
    weight, heightFt, heightIn, gender, state,
    groceryList,
  } = body;

  await supabase.from("meal_plans").upsert(
    {
      user_id: user.id,
      budget: parseFloat(String(budget || 50)),
      goal: goal || "",
      diet: diet || "",
      tier: tier || "free",
      weight_lbs: weight != null && weight !== "" ? parseFloat(String(weight)) : null,
      height_ft: heightFt != null && heightFt !== "" ? parseInt(String(heightFt)) : null,
      height_in: heightIn != null && heightIn !== "" ? parseInt(String(heightIn)) : null,
      gender: gender || null,
      state: state || null,
      grocery_list: groceryList ?? null,
    },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ success: true });
}
