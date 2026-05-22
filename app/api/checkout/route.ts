import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getTierById } from "@/app/data/plans";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

export async function POST(req: NextRequest) {
  const { budget, goal, diet, tier, origin } = await req.json();

  const planTier = getTierById(tier);
  if (planTier.priceInCents === 0) {
    return NextResponse.json({ error: "Free tier does not require checkout" }, { status: 400 });
  }

  const planParams = new URLSearchParams({ budget, goal, diet, tier }).toString();
  const successUrl = `${origin}/plan?${planParams}&paid=true`;
  const cancelUrl = `${origin}/plan?${planParams}`;

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
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return NextResponse.json({ url: session.url });
}
