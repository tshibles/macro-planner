import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

export async function POST(req: NextRequest) {
  const { budget, goal, diet, origin } = await req.json();

  const planParams = new URLSearchParams({ budget, goal, diet }).toString();
  const successUrl = `${origin}/plan?${planParams}&paid=true`;
  const cancelUrl = `${origin}/plan?${planParams}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "7-Day Macro Meal Plan",
            description: "Unlock your full personalized 7-day macro-balanced meal plan",
          },
          unit_amount: 1700,
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
