import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getTierById } from "@/app/data/plans";
import { createClient } from "@/app/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

// Origins Stripe is allowed to redirect back to. Anything else (or a missing
// Origin header) falls back to the canonical production URL.
const ALLOWED_ORIGINS = new Set([
  "https://www.campusmacros.com",
  "https://campusmacros.com",
  "http://localhost:3000",
]);
const CANONICAL_ORIGIN = "https://www.campusmacros.com";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    budget, goal, diets = [], tier,
    people = "1",
    age = "", activityLevel = "", allergies = "",
    weight = "", heightFt = "", heightIn = "", gender = "", state = "",
    targetWeight = "", goalTimeframe = "",
    successPath = "", cancelPath = "",
  } = await req.json();

  // The redirect origin is derived SERVER-SIDE from the request's own Origin
  // header, validated against an allowlist — never from the request body. A
  // client-supplied origin would let a caller point Stripe's post-payment
  // redirect at an arbitrary site (security audit M2).
  const headerOrigin = req.headers.get("origin") ?? "";
  const origin = ALLOWED_ORIGINS.has(headerOrigin)
    ? headerOrigin
    : CANONICAL_ORIGIN;

  const planTier = getTierById(tier);
  if (planTier.priceInCents === 0) {
    return NextResponse.json({ error: "Free tier does not require checkout" }, { status: 400 });
  }

  const dietsArr: string[] = Array.isArray(diets) ? diets : [];

  const baseParams = new URLSearchParams({ budget, people, goal, tier });
  if (dietsArr.length > 0) baseParams.set("diets", dietsArr.join(","));
  if (age) baseParams.set("age", age);
  if (activityLevel) baseParams.set("activityLevel", activityLevel);
  if (allergies) baseParams.set("allergies", allergies);
  if (weight) baseParams.set("weight", weight);
  if (heightFt) baseParams.set("heightFt", heightFt);
  if (heightIn) baseParams.set("heightIn", heightIn);
  if (gender) baseParams.set("gender", gender);
  if (state) baseParams.set("state", state);
  if (targetWeight) baseParams.set("targetWeight", targetWeight);
  if (goalTimeframe) baseParams.set("goalTimeframe", goalTimeframe);

  // Callers may supply explicit same-site return paths (e.g. the /checkout
  // page sends new users to /onboarding after paying); the legacy plan-page
  // URLs remain the default.
  const isSafePath = (p: unknown): p is string =>
    typeof p === "string" && p.startsWith("/") && !p.startsWith("//");
  const successUrl = isSafePath(successPath)
    ? `${origin}${successPath}`
    : `${origin}/plan?${baseParams.toString()}&paid=true`;
  const cancelUrl = isSafePath(cancelPath)
    ? `${origin}${cancelPath}`
    : `${origin}/plan?${baseParams.toString()}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${planTier.label} Macro Meal Plan`,
            description: `${planTier.days}-day personalized macro-balanced meal plan with full recipes`,
          },
          unit_amount: planTier.priceInCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    // Attach user ID so the webhook can write the subscription row.
    client_reference_id: user.id,
    metadata: {
      tier: planTier.id,
      days: String(planTier.days),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return NextResponse.json({ url: session.url });
}
