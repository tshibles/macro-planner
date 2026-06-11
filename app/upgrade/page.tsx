"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { planTiers } from "@/app/data/plans";
import { PageFooter, PageHeader } from "@/app/components/PageHeader";

const PAID_TIERS = planTiers.filter((t) => t.priceInCents > 0);

// Paywall for expired or inactive subscriptions. Selecting a plan routes to
// /checkout; users who turn out to have active access are sent to /plan.
export default function UpgradePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/subscriptions/status")
      .then((r) => r.json())
      .then((sub) => {
        if (!active) return;
        if (sub.unlocked) {
          router.replace("/plan");
          return;
        }
        setChecked(true);
      })
      .catch(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col">
      <PageHeader />

      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="mb-10 text-center max-w-xl">
          <div className="w-12 h-12 mx-auto mb-5 rounded-full bg-white/8 border border-white/12 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Your access has{" "}
            <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
              ended
            </span>
          </h1>
          <p className="text-gray-400">
            Your trial or subscription has expired. Pick a plan to get back to
            your meals, grocery lists, and saved preferences.
          </p>
        </div>

        {!checked ? (
          <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="h-[180px] rounded-2xl bg-white/[0.02] border border-white/10 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PAID_TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/checkout?tier=${t.id}`)}
                className={`text-left rounded-2xl border p-6 transition-all cursor-pointer ${
                  t.badge === "Best Value"
                    ? "bg-brand-500/10 border-brand-500/40 hover:border-brand-400"
                    : "bg-white/[0.04] border-white/10 hover:border-white/25"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-300">{t.label}</span>
                  {t.badge && (
                    <span className="text-[10px] bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-full px-2 py-0.5 leading-none">
                      {t.badge}
                    </span>
                  )}
                </div>
                <p className="text-3xl font-extrabold text-white">
                  ${t.price}
                  <span className="text-sm font-medium text-gray-500">
                    /{t.id === "annual" ? "year" : "month"}
                  </span>
                </p>
                {t.id === "annual" && (
                  <p className="text-[11px] text-brand-400 mt-0.5">
                    ${(t.price / 12).toFixed(2)}/mo equivalent
                  </p>
                )}
                <p className="text-sm text-gray-400 leading-relaxed mt-2">
                  {t.description}
                </p>
              </button>
            ))}
          </div>
        )}

        <p className="mt-8 text-xs text-gray-600 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Secure payment via Stripe · Your saved plan and preferences are kept
        </p>
      </section>

      <PageFooter />
    </main>
  );
}
