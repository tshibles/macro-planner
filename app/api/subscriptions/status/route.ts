import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ unlocked: false });
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("plan_tier, plan_expires_at")
    .eq("user_id", user.id)
    .gt("plan_expires_at", new Date().toISOString())
    .order("plan_expires_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    return NextResponse.json({ unlocked: false });
  }

  return NextResponse.json({
    unlocked: true,
    tier: data.plan_tier,
    expiresAt: data.plan_expires_at,
  });
}
