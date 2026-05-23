import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
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

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, free_trial_used: true }, { onConflict: "id" });

  if (error) {
    return NextResponse.json(
      { error: "Failed to record trial" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
