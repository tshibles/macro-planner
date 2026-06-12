import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import {
  runSupportTurn,
  SupportChatMessage,
  MAX_MESSAGES,
  MAX_MESSAGE_CHARS,
} from "@/app/lib/supportChat";

// AI support chat for logged-in users. The assistant only gathers information
// (a smart intake form): this route READS the user's subscription/plan rows to
// give the model context, but no account data is ever written or modified.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : null;
  if (!raw || raw.length === 0 || raw.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }
  const messages: SupportChatMessage[] = [];
  for (const m of raw) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      m.content.length === 0 ||
      m.content.length > MAX_MESSAGE_CHARS
    ) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }
    messages.push({ role: m.role, content: m.content });
  }
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
  }

  // Read-only account context for the intake email.
  const [{ data: sub }, { data: plan }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_tier, plan_expires_at")
      .eq("user_id", user.id)
      .gt("plan_expires_at", new Date().toISOString())
      .order("plan_expires_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meal_plans")
      .select("budget, goal")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  try {
    const result = await runSupportTurn(messages, {
      email: user.email,
      userId: user.id,
      subscriptionTier: sub?.plan_tier ?? null,
      subscriptionExpiresAt: sub?.plan_expires_at ?? null,
      planBudget: plan?.budget ?? null,
      planGoal: plan?.goal ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[support] chat turn failed:", e);
    return NextResponse.json(
      { error: "Support chat is temporarily unavailable" },
      { status: 502 }
    );
  }
}
