"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { getTierById } from "@/app/data/plans";
import { US_STATES } from "@/app/data/stateMultipliers";
import { checkGoalRate, deriveGoal } from "@/app/lib/tdee";
import { dietaryOptions, activityLevels, genderOptions } from "@/app/data/formOptions";
import { PageFooter, PageHeader } from "@/app/components/PageHeader";
import { GlowBackdrop } from "@/app/components/Decor";

// "trial" — user chose the free trial (or has no active subscription yet);
// submitting consumes the trial. "paid" — an active subscriptions row exists
// (they paid before onboarding, or are re-onboarding mid-subscription), so
// submitting just generates against their subscription tier.
// "paymentPending" — the user just returned from Stripe (?paid=true) but the
// webhook hasn't written the subscription row yet. We must NOT fall back to
// the trial here: that would silently consume a paying customer's free trial
// and build them a 7-day plan they didn't buy.
type Mode = "loading" | "trial" | "paid" | "paymentPending";

export default function OnboardingPage() {
  const router = useRouter();
  const posthog = usePostHog();
  const [budget, setBudget] = useState("");
  const [numberOfPeople, setNumberOfPeople] = useState("1");
  const [targetWeight, setTargetWeight] = useState("");
  const [goalTimeframe, setGoalTimeframe] = useState("");
  const [selectedDiets, setSelectedDiets] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [activityLevel, setActivityLevel] = useState("1.55");
  const [allergies, setAllergies] = useState("");
  const [weight, setWeight] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [gender, setGender] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("loading");
  const [subTier, setSubTier] = useState("monthly");

  function toggleDiet(value: string) {
    setSelectedDiets((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  }

  // Resolve whether this user is onboarding on a paid subscription or the free
  // trial. When returning from Stripe (?paid=true) poll for up to 12 s to give
  // the webhook time to land before falling back.
  useEffect(() => {
    let active = true;
    let attempt = 0;
    const paid =
      new URLSearchParams(window.location.search).get("paid") === "true";
    const maxAttempts = paid ? 8 : 1;

    async function check() {
      try {
        const sub = await fetch("/api/subscriptions/status").then((r) => r.json());
        if (!active) return;
        if (sub.unlocked) {
          setSubTier(getTierById(sub.tier ?? "monthly").id);
          setMode("paid");
          return;
        }
        attempt++;
        if (attempt < maxAttempts) {
          setTimeout(check, 1500);
          return;
        }
        if (paid) {
          // They just paid but the webhook hasn't landed. Never downgrade a
          // paying customer to the trial — surface the pending state instead.
          setMode("paymentPending");
          return;
        }
        const trial = await fetch("/api/free-trial/status").then((r) => r.json());
        if (!active) return;
        if (trial.used) {
          // No access and the trial is spent — nothing to onboard into.
          router.replace("/upgrade");
          return;
        }
        setMode("trial");
      } catch {
        if (active) setMode(paid ? "paymentPending" : "trial");
      }
    }

    check();
    return () => {
      active = false;
    };
  }, [router]);

  // Goal is derived from the direction of the target: above current weight =
  // muscle gain, below = fat loss, none/equal = maintenance.
  const currentWeightNum = parseFloat(weight) || 0;
  const targetWeightNum = parseFloat(targetWeight) || 0;
  const timeframeNum = parseFloat(goalTimeframe) || 0;
  const goal = deriveGoal(currentWeightNum || undefined, targetWeightNum || undefined);
  const rateCheck =
    currentWeightNum && targetWeightNum && timeframeNum > 0
      ? checkGoalRate(currentWeightNum, targetWeightNum, timeframeNum)
      : null;

  function buildParams(tierId: string) {
    const p = new URLSearchParams({
      budget: budget || "50",
      people: numberOfPeople || "1",
      goal,
      tier: tierId,
    });
    if (selectedDiets.length > 0) p.set("diets", selectedDiets.join(","));
    if (age) p.set("age", age);
    if (activityLevel) p.set("activityLevel", activityLevel);
    if (allergies) p.set("allergies", allergies);
    if (weight) p.set("weight", weight);
    if (heightFt) p.set("heightFt", heightFt);
    if (heightIn) p.set("heightIn", heightIn);
    if (gender) p.set("gender", gender);
    if (state) p.set("state", state);
    if (targetWeight) p.set("targetWeight", targetWeight);
    if (goalTimeframe) p.set("goalTimeframe", goalTimeframe);
    return p;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "loading" || mode === "paymentPending") return;
    setLoading(true);

    const tierId = mode === "paid" ? subTier : "free";
    const planProps = { budget: budget || "50", goal, diets: selectedDiets, tier: tierId, weight, gender, state };

    if (mode === "trial") {
      const res = await fetch("/api/free-trial/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: budget || "50",
          numberOfPeople: parseInt(numberOfPeople || "1"),
          goal,
          diets: selectedDiets,
          age: age ? parseInt(age) : null,
          activityLevel: activityLevel ? parseFloat(activityLevel) : null,
          allergies: allergies || null,
          weight: weight ? parseFloat(weight) : null,
          heightFt: heightFt ? parseInt(heightFt) : null,
          heightIn: heightIn ? parseInt(heightIn) : null,
          gender: gender || null,
          state: state || null,
          targetWeight: targetWeight ? parseFloat(targetWeight) : null,
          goalTimeframe: goalTimeframe ? parseInt(goalTimeframe) : null,
        }),
      });
      if (!res.ok) {
        // Trial already used (e.g. opened in two tabs) — paywall.
        router.replace("/upgrade");
        return;
      }
    } else {
      // Paid users: persist the full preference set so the settings page and
      // returning-visit restoration have everything. (The trial path persists
      // via /api/free-trial/use above.)
      await fetch("/api/meal-plans/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: budget || "50",
          numberOfPeople: numberOfPeople || "1",
          goal,
          diets: selectedDiets,
          tier: tierId,
          age: age || null,
          activityLevel: activityLevel || null,
          allergies: allergies || null,
          weight: weight || null,
          heightFt: heightFt || null,
          heightIn: heightIn || null,
          gender: gender || null,
          state: state || null,
          targetWeight: targetWeight || null,
          goalTimeframe: goalTimeframe || null,
        }),
      }).catch(() => {});
    }

    posthog.capture("plan_generated", planProps);
    router.push(`/plan?${buildParams(tierId).toString()}`);
  }

  const inputClass =
    "w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition";
  const smallInputClass =
    "w-full bg-white border border-gray-200 rounded-xl pl-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm";

  return (
    <main className="relative overflow-hidden min-h-screen flex flex-col">
      <GlowBackdrop variant="subtle" />
      <PageHeader />

      <section className="flex-1 flex flex-col items-center px-4 py-12">
        <div className="mb-8 text-center max-w-xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Let&apos;s build your{" "}
            <span className="bg-gradient-to-r from-brand-700 to-emerald-600 bg-clip-text text-transparent">
              meal plan
            </span>
          </h1>
          <p className="text-gray-600">
            Tell us your budget, goal, and dietary needs — we&apos;ll generate a
            full plan with recipes and a grocery list.
          </p>
          {mode === "paid" && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 border border-brand-300 rounded-full px-3 py-1">
              {getTierById(subTier).label} plan active — {getTierById(subTier).days} days of meals
            </p>
          )}
          {mode === "trial" && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-full px-3 py-1">
              Free trial — your first 7-day plan is on us
            </p>
          )}
          {mode === "paymentPending" && (
            <div className="mt-4 max-w-md mx-auto text-left text-sm text-amber-800/90 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
              <p className="font-semibold text-amber-700 mb-1">Payment received — confirming with Stripe…</p>
              <p className="text-xs leading-relaxed">
                Your card was charged but our confirmation hasn&apos;t arrived yet (this
                usually takes a few seconds). Your full plan is safe — we won&apos;t start
                a trial instead.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-2 text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-800"
              >
                Check again
              </button>
            </div>
          )}
        </div>

        {/* Form Card */}
        <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Budget + People */}
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor="budget" className="text-sm font-medium text-gray-700">
                  Weekly grocery budget
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 font-medium">$</span>
                  <input
                    id="budget"
                    type="number"
                    min={10}
                    max={500}
                    step={5}
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="50"
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 w-28">
                <label htmlFor="people" className="text-sm font-medium text-gray-700">
                  # of people
                </label>
                <input
                  id="people"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={numberOfPeople}
                  onChange={(e) => setNumberOfPeople(e.target.value)}
                  placeholder="1"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Goal Target */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Your goal
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  uses your weight from body metrics below
                </span>
              </label>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label htmlFor="targetWeight" className="text-xs text-gray-500">
                    Target weight
                  </label>
                  <div className="relative">
                    <input
                      id="targetWeight"
                      type="number"
                      min={80}
                      max={400}
                      step={1}
                      value={targetWeight}
                      onChange={(e) => setTargetWeight(e.target.value)}
                      placeholder="150"
                      className={`${smallInputClass} pr-12`}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">lbs</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label htmlFor="goalTimeframe" className="text-xs text-gray-500">
                    Timeframe
                  </label>
                  <div className="relative">
                    <input
                      id="goalTimeframe"
                      type="number"
                      min={1}
                      max={104}
                      step={1}
                      value={goalTimeframe}
                      onChange={(e) => setGoalTimeframe(e.target.value)}
                      placeholder="12"
                      className={`${smallInputClass} pr-14`}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">weeks</span>
                  </div>
                </div>
              </div>
              {rateCheck && rateCheck.direction !== "maintain" && (
                rateCheck.safe ? (
                  <p className="text-xs text-gray-500">
                    {rateCheck.direction === "loss" ? "Losing" : "Gaining"}{" "}
                    {Math.abs(targetWeightNum - currentWeightNum).toFixed(0)} lbs over {timeframeNum} week{timeframeNum === 1 ? "" : "s"}
                    (~{rateCheck.ratePerWeek.toFixed(1)} lb/week) — a healthy, sustainable pace.
                  </p>
                ) : (
                  <div className="text-xs text-amber-600/90 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
                    <p>
                      {rateCheck.direction === "loss" ? "Losing" : "Gaining"}{" "}
                      {Math.abs(targetWeightNum - currentWeightNum).toFixed(0)} lbs in {timeframeNum} week
                      {timeframeNum === 1 ? "" : "s"} means ~{rateCheck.ratePerWeek.toFixed(1)} lb/week —
                      above the safe rate of {rateCheck.maxSafeRate} lb/week for{" "}
                      {rateCheck.direction === "loss" ? "fat loss" : "muscle gain"}.
                    </p>
                    <p className="mt-1">
                      We suggest at least <strong>{rateCheck.suggestedWeeks} weeks</strong> for this goal.
                      You can still proceed with your chosen timeframe.
                    </p>
                  </div>
                )
              )}
            </div>

            {/* Dietary Restrictions */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Dietary restrictions
              </label>
              <div className="grid grid-cols-2 gap-2">
                {dietaryOptions.map((opt) => {
                  const checked = selectedDiets.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-all ${
                        checked
                          ? "border-brand-500/60 bg-brand-50"
                          : "border-gray-200 bg-brand-50/40 hover:border-brand-300"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          checked ? "border-brand-500 bg-brand-500" : "border-gray-600"
                        }`}
                      >
                        {checked && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 text-gray-900">
                            <path d="M10.28 2.28a.75.75 0 0 0-1.06 0L4.5 7 2.78 5.28a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l5.25-5.25a.75.75 0 0 0 0-1.06Z" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-gray-800">{opt.label}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDiet(opt.value)}
                        className="sr-only"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Allergies */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="allergies" className="text-sm font-medium text-gray-700">
                Allergies
                <span className="ml-2 text-xs text-gray-400 font-normal">comma-separated, e.g. eggs, peanuts</span>
              </label>
              <input
                id="allergies"
                type="text"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="e.g. eggs, peanuts, shellfish"
                className={inputClass}
              />
            </div>

            {/* Body Metrics (optional) */}
            <div className="flex flex-col gap-3 border border-gray-200 rounded-xl p-4 bg-brand-50/40">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Body metrics</p>
                <span className="text-xs text-gray-400 bg-white rounded-full px-2 py-0.5">
                  Optional — enables calorie targeting
                </span>
              </div>

              {/* Weight */}
              <div className="flex flex-col gap-1">
                <label htmlFor="weight" className="text-xs text-gray-500">
                  Weight
                </label>
                <div className="relative">
                  <input
                    id="weight"
                    type="number"
                    min={80}
                    max={400}
                    step={1}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="160"
                    className={`${smallInputClass} pr-12`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">lbs</span>
                </div>
              </div>

              {/* Height */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Height</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={4}
                      max={7}
                      step={1}
                      value={heightFt}
                      onChange={(e) => setHeightFt(e.target.value)}
                      placeholder="5"
                      className={`${smallInputClass} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">ft</span>
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={0}
                      max={11}
                      step={1}
                      value={heightIn}
                      onChange={(e) => setHeightIn(e.target.value)}
                      placeholder="10"
                      className={`${smallInputClass} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">in</span>
                  </div>
                </div>
              </div>

              {/* Gender + Age */}
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label htmlFor="gender" className="text-xs text-gray-500">
                    Biological sex
                  </label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer text-sm"
                  >
                    {genderOptions.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 w-24">
                  <label htmlFor="age" className="text-xs text-gray-500">Age</label>
                  <input
                    id="age"
                    type="number"
                    min={16}
                    max={60}
                    step={1}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="20"
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
                  />
                </div>
              </div>

              {/* Activity Level */}
              <div className="flex flex-col gap-1">
                <label htmlFor="activityLevel" className="text-xs text-gray-500">Activity level</label>
                <select
                  id="activityLevel"
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer text-sm"
                >
                  {activityLevels.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* State */}
              <div className="flex flex-col gap-1">
                <label htmlFor="state" className="text-xs text-gray-500">
                  State <span className="text-gray-400">(for grocery price estimates)</span>
                </label>
                <select
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer text-sm"
                >
                  <option value="" className="bg-white">Select state…</option>
                  {US_STATES.map((s) => (
                    <option key={s.value} value={s.value} className="bg-white">
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={loading || mode === "loading" || mode === "paymentPending"}
              className="mt-2 w-full bg-brand-600 hover:bg-brand-700 active:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors duration-150 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
            >
              {loading || mode === "loading" || mode === "paymentPending" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {mode === "loading"
                    ? "Checking your plan…"
                    : mode === "paymentPending"
                      ? "Waiting for payment confirmation…"
                      : "Building your plan…"}
                </>
              ) : (
                <>
                  {mode === "paid"
                    ? `Generate My ${getTierById(subTier).days}-Day Plan`
                    : "Generate Free 7-Day Plan"}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
      </section>

      <PageFooter />
    </main>
  );
}
