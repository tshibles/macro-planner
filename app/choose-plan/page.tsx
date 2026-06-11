"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { planTiers } from "@/app/data/plans";
import { PageFooter, PageHeader } from "@/app/components/PageHeader";

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
    <main className="min-h-screen flex flex-col">
      <PageHeader />

      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="mb-10 text-center max-w-xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Choose your{" "}
            <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
              plan
            </span>
          </h1>
          <p className="text-gray-400">
            Start with a free week, or unlock a full plan right away. You&apos;ll
            set up your preferences next.
          </p>
        </div>

        {!checked ? (
          <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[220px] rounded-2xl bg-white/[0.02] border border-white/10 animate-pulse" />
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
                      ? "border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
                      : t.badge === "Best Value"
                      ? "bg-brand-500/10 border-brand-500/40 hover:border-brand-400 cursor-pointer"
                      : "bg-white/[0.04] border-white/10 hover:border-white/25 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-300">{t.label}</span>
                    {isFreeDisabled ? (
                      <span className="text-[10px] bg-gray-700/50 text-gray-500 border border-gray-600/30 rounded-full px-2 py-0.5 leading-none">
                        Used
                      </span>
                    ) : t.badge ? (
                      <span className="text-[10px] bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-full px-2 py-0.5 leading-none">
                        {t.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-3xl font-extrabold text-white">
                    {t.price === 0 ? "Free" : `$${t.price}`}
                    {t.price > 0 && (
                      <span className="text-sm font-medium text-gray-500">
                        /{t.id === "annual" ? "year" : "month"}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-400 leading-relaxed mt-2 flex-1">
                    {t.description}
                  </p>
                  <span
                    className={`mt-5 text-center text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors ${
                      isFreeDisabled
                        ? "bg-white/5 text-gray-600"
                        : t.badge === "Best Value"
                        ? "bg-brand-500 text-white"
                        : "bg-white/8 border border-white/10 text-white"
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
          <p className="mt-6 text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Your free trial has been used. Choose a paid plan to continue.
          </p>
        )}
      </section>

      <PageFooter />
    </main>
  );
}
