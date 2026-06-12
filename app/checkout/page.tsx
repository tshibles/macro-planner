"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { planTiers } from "@/app/data/plans";
import { PageFooter, PageHeader } from "@/app/components/PageHeader";
import { GlowBackdrop } from "@/app/components/Decor";

const PAID_TIERS = planTiers.filter((t) => t.priceInCents > 0);

function CheckoutContent() {
  const params = useSearchParams();
  const initialTier = params.get("tier");
  const canceled = params.get("canceled") === "true";
  const [tierId, setTierId] = useState(
    PAID_TIERS.some((t) => t.id === initialTier) ? (initialTier as string) : "monthly"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = PAID_TIERS.find((t) => t.id === tierId)!;

  async function handlePay() {
    setLoading(true);
    setError(null);
    try {
      // After payment: users with a saved plan return to it; first-time buyers
      // go fill out the onboarding form.
      const { plan } = await fetch("/api/meal-plans/saved")
        .then((r) => r.json())
        .catch(() => ({ plan: null }));
      const successPath = plan ? "/plan?paid=true" : "/onboarding?paid=true";
      const cancelPath = `/checkout?tier=${tierId}&canceled=true`;

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tierId,
          budget: plan ? String(plan.budget) : "50",
          goal: plan?.goal ?? "",
          origin: window.location.origin,
          successPath,
          cancelPath,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Could not start checkout. Please try again.");
    } catch {
      setError("Could not start checkout. Please try again.");
    }
    setLoading(false);
  }

  return (
    <main className="relative overflow-hidden min-h-screen flex flex-col">
      <GlowBackdrop variant="subtle" />
      <PageHeader />

      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="mb-10 text-center max-w-xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Complete your{" "}
            <span className="bg-gradient-to-r from-brand-700 to-emerald-600 bg-clip-text text-transparent">
              purchase
            </span>
          </h1>
          <p className="text-gray-600">
            One-time payment, full access for the length of your plan.
          </p>
        </div>

        <div className="w-full max-w-md space-y-3">
          {canceled && (
            <p className="text-xs text-amber-600/80 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
              Payment canceled — you haven&apos;t been charged. Pick a plan to try again.
            </p>
          )}

          {PAID_TIERS.map((t) => (
            <label
              key={t.id}
              className={`relative flex items-center justify-between gap-3 rounded-xl px-5 py-4 border transition-all cursor-pointer ${
                tierId === t.id
                  ? "border-brand-500/60 bg-brand-50"
                  : "border-gray-200 bg-brand-50/40 hover:border-brand-300"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                    tierId === t.id ? "border-brand-500 bg-brand-500" : "border-gray-600"
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                    {t.badge && (
                      <span className="text-xs bg-brand-100 text-brand-700 border border-brand-300 rounded-full px-1.5 py-0.5 leading-none">
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{t.description}</span>
                </div>
              </div>
              <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                ${t.price}/{t.id === "annual" ? "yr" : "mo"}
              </span>
              <input
                type="radio"
                name="tier"
                value={t.id}
                checked={tierId === t.id}
                onChange={() => setTierId(t.id)}
                className="sr-only"
              />
            </label>
          ))}

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-300 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handlePay}
            disabled={loading}
            className="mt-2 w-full bg-brand-600 hover:bg-brand-700 active:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Redirecting to checkout…
              </>
            ) : (
              `Pay $${selected.price} — ${selected.label} Plan`
            )}
          </button>

          <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5 pt-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            Secure payment via Stripe
          </p>
        </div>
      </section>

      <PageFooter />
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutContent />
    </Suspense>
  );
}
