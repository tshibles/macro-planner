import { createClient } from "@/app/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { mealId } = await req.json();
  if (!mealId || typeof mealId !== "string") {
    return NextResponse.json({ error: "Missing mealId" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("meal_plans")
    .select("disliked_meal_ids")
    .eq("user_id", user.id)
    .single();

  const current: string[] = existing?.disliked_meal_ids ?? [];
  if (current.includes(mealId)) return NextResponse.json({ ok: true });

  const updated = [...current, mealId];

  await supabase
    .from("meal_plans")
    .update({ disliked_meal_ids: updated })
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true, dislikedCount: updated.length });
}
