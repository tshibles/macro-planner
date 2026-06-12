"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { planTiers } from "@/app/data/plans";
import { PageFooter, PageHeader } from "@/app/components/PageHeader";
import { GlowBackdrop } from "@/app/components/Decor";

// Post-signup plan selection. Free Trial goes straight to onboarding; paid
// tiers go to /checkout and pay before onboarding.
export default function ChoosePlanPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/subscriptions/status").then((r) => r.json()).catch(() => ({ unlocked: false })),
      fetch("/api/free-trial/status").then((r) => r.json()).catch(() => ({ used: false })),
    ]).then(([sub, trial]) => {
      if (!active) return;
      if (sub.unlocked) {
        // Already has access — nothing to choose.
        router.replace("/plan");
        return;
      }
      setTrialUsed(trial.used ?? false);
      setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  function handleSelect(tierId: string) {
    if (tierId === "free") {
      router.push("/onboarding");
    } else {
      router.push(`/checkout?tier=${tierId}`);
    }
  }

  return (
    <main className="relative overflow-hidden min-h-screen flex flex-col">
      <GlowBackdrop variant="subtle" />
      <PageHeader />

      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="mb-10 text-center max-w-xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Choose your{" "}
            <span className="bg-gradient-to-r from-brand-700 to-emerald-600 bg-clip-text text-transparent">
              plan
            </span>
          </h1>
          <p className="text-gray-600">
            Start with a free week, or unlock a full plan right away. You&apos;ll
            set up your preferences next.
          </p>
        </div>

        {!checked ? (
          <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[220px] rounded-2xl bg-brand-50/40 border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-4">
            {planTiers.map((t) => {
              const isFreeDisabled = t.id === "free" && trialUsed;
              return (
                <button
                  key={t.id}
                  onClick={() => !isFreeDisabled && handleSelect(t.id)}
                  disabled={isFreeDisabled}
                  className={`text-left rounded-2xl border p-6 flex flex-col transition-all ${
                    isFreeDisabled
                      ? "border-brand-900/10 bg-white/[0.01] opacity-50 cursor-not-allowed"
                      : t.badge === "Best Value"
                      ? "bg-brand-50 border-brand-400 hover:border-brand-400 cursor-pointer"
                      : "bg-white border-gray-200 hover:border-brand-300 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700">{t.label}</span>
                    {isFreeDisabled ? (
                      <span className="text-[10px] bg-gray-700/50 text-gray-500 border border-gray-600/30 rounded-full px-2 py-0.5 leading-none">
                        Used
                      </span>
                    ) : t.badge ? (
                      <span className="text-[10px] bg-brand-100 text-brand-700 border border-brand-300 rounded-full px-2 py-0.5 leading-none">
                        {t.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-3xl font-extrabold text-gray-900">
                    {t.price === 0 ? "Free" : `$${t.price}`}
                    {t.price > 0 && (
                      <span className="text-sm font-medium text-gray-500">
                        /{t.id === "annual" ? "year" : "month"}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed mt-2 flex-1">
                    {t.description}
                  </p>
                  <span
                    className={`mt-5 text-center text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors ${
                      isFreeDisabled
                        ? "bg-white text-gray-400"
                        : t.badge === "Best Value"
                        ? "bg-brand-600 text-white"
                        : "bg-gray-50 border border-gray-200 text-gray-900"
                    }`}
                  >
                    {t.id === "free"
                      ? isFreeDisabled
                        ? "Trial used"
                        : "Start free trial"
                      : "Continue to payment"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {checked && trialUsed && (
          <p className="mt-6 text-xs text-amber-600/80 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
            Your free trial has been used. Choose a paid plan to continue.
          </p>
        )}
      </section>

      <PageFooter />
    </main>
  );
}
