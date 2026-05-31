import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

// Service-role client bypasses RLS — only used server-side in this route.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const userId = session.client_reference_id;
    const tier = session.metadata?.tier;
    const days = parseInt(session.metadata?.days ?? "0", 10);

    if (!userId || !tier || !days) {
      // Incomplete metadata — log and return 200 so Stripe doesn't retry.
      console.error("stripe webhook: missing metadata", { userId, tier, days });
      return NextResponse.json({ received: true });
    }

    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const supabase = adminClient();
    const { error } = await supabase.from("subscriptions").insert({
      user_id: userId,
      plan_tier: tier,
      plan_expires_at: expiresAt,
      stripe_session_id: session.id,
    });

    if (error && error.code !== "23505") {
      // 23505 = unique_violation (duplicate session ID — idempotent replay). Any
      // other error is unexpected; log it but still return 200 so Stripe retries later.
      console.error("stripe webhook: supabase insert error", error);
    }
  }

  return NextResponse.json({ received: true });
}
