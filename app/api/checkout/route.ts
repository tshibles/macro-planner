import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getTierById } from "@/app/data/plans";
import { createClient } from "@/app/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

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
    origin,
  } = await req.json();

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

  const successUrl = `${origin}/plan?${baseParams.toString()}&paid=true`;
  const cancelUrl = `${origin}/plan?${baseParams.toString()}`;

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
