import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { generatePlanForRequest, loadUserPlanData, UserPlanData } from "@/app/lib/planService";
import { checkRateLimit, rateLimitResponse } from "@/app/lib/rateLimit";

export async function POST(req: NextRequest) {
  // Unauthenticated compute-heavy route — cap per IP. Normal usage is 1-2
  // generations per page view, so 10/min only catches abusive volume.
  const rl = await checkRateLimit("generate-plan", 10, req);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const body = await req.json();

  if (typeof body.budget !== "number" || typeof body.totalDays !== "number") {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  // Fetch dislikes/likes/swaps for authenticated users
  let userData: UserPlanData | null = null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userData = await loadUserPlanData(supabase, user.id);
    }
  } catch {
    // Non-fatal: unauthenticated or missing row
  }

  const plan = generatePlanForRequest(body, userData);
  return NextResponse.json(plan);
}
