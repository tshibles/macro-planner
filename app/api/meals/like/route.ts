import { createClient } from "@/app/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Toggles a thumbs-up. Liked meals are excluded from future plan generations
// and kept in liked_meal_ids for a future "favorites" feature.
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
    .select("liked_meal_ids, disliked_meal_ids")
    .eq("user_id", user.id)
    .single();

  const liked: string[] = existing?.liked_meal_ids ?? [];
  const disliked: string[] = existing?.disliked_meal_ids ?? [];

  const nowLiked = !liked.includes(mealId);
  const updatedLiked = nowLiked ? [...liked, mealId] : liked.filter((id) => id !== mealId);
  // A meal can't be both liked and disliked.
  const updatedDisliked = nowLiked ? disliked.filter((id) => id !== mealId) : disliked;

  await supabase
    .from("meal_plans")
    .update({ liked_meal_ids: updatedLiked, disliked_meal_ids: updatedDisliked })
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true, liked: nowLiked });
}
