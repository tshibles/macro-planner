"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { getTierById } from "@/app/data/plans";
import { US_STATES } from "@/app/data/stateMultipliers";
import { deriveGoal } from "@/app/lib/tdee";
import { dietaryOptions, activityLevels, genderOptions } from "@/app/data/formOptions";
import type { SavedPlan } from "@/app/lib/savedPlanParams";

interface SubStatus {
  unlocked: boolean;
  tier?: string;
  expiresAt?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const posthog = usePostHog();

  const [loaded, setLoaded] = useState(false);
  const [sub, setSub] = useState<SubStatus | null>(null);

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the saved meal_plans row; subscription status feeds the
  // status card and the tier used for regeneration.
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/meal-plans/saved").then((r) => r.json()).catch(() => ({ plan: null })),
      fetch("/api/subscriptions/status").then((r) => r.json()).catch(() => ({ unlocked: false })),
    ]).then(([{ plan }, subData]: [{ plan: SavedPlan | null }, SubStatus]) => {
      if (!active) return;
      setSub(subData);
      if (plan) {
        setBudget(String(plan.budget ?? ""));
        setTargetWeight(plan.target_weight != null ? String(plan.target_weight) : "");
        setGoalTimeframe(plan.goal_timeframe_weeks != null ? String(plan.goal_timeframe_weeks) : "");
        setSelectedDiets(plan.diets ?? (plan.diet ? [plan.diet] : []));
        setAge(plan.age != null ? String(plan.age) : "");
        setActivityLevel(plan.activity_level != null ? String(plan.activity_level) : "1.55");
        setAllergies(plan.allergies ?? "");
        setWeight(plan.weight_lbs != null ? String(plan.weight_lbs) : "");
        setHeightFt(plan.height_ft != null ? String(plan.height_ft) : "");
        setHeightIn(plan.height_in != null ? String(plan.height_in) : "");
        setGender(plan.gender ?? "");
        setState(plan.state ?? "");
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  function toggleDiet(value: string) {
    setSelectedDiets((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  }

  const goal = deriveGoal(
    parseFloat(weight) || undefined,
    parseFloat(targetWeight) || undefined
  );

  // Regenerates within the current subscription: persist the updated
  // preferences with a fresh salt, then send the user to /plan — same flow as
  // a fresh generation, no charge, no paywall.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // An unlocked subscription missing its tier label must never demote the
    // regenerated plan to the 7-day free length — assume monthly.
    const tierId = sub?.unlocked ? getTierById(sub.tier ?? "monthly").id : "free";
    const newSalt = Math.floor(Math.random() * 0x7fffffff);

    const res = await fetch("/api/meal-plans/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salt: newSalt,
        budget: budget || "50",
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
    }).catch(() => null);

    if (!res || !res.ok) {
      setError("Could not save your preferences. Please try again.");
      setSaving(false);
      return;
    }

    posthog.capture("plan_regenerated", {
      budget: budget || "50",
      goal,
      diets: selectedDiets,
      tier: tierId,
    });

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
    p.set("salt", String(newSalt));
    router.push(`/plan?${p.toString()}`);
  }

  const tierInfo = sub?.tier ? getTierById(sub.tier) : null;
  const expiresAt = sub?.expiresAt ? new Date(sub.expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000))
    : null;

  const inputClass =
    "w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition";
  const smallInputClass =
    "w-full bg-white border border-gray-200 rounded-xl pl-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm";
  const selectClass =
    "w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer text-sm";

  if (!loaded) {
    return (
      <div className="flex-1 min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-600 text-sm">Loading your settings…</div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col">
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">
            <span className="bg-gradient-to-r from-brand-700 to-emerald-600 bg-clip-text text-transparent">
              Settings
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Update your preferences and regenerate your plan, or review your
            subscription.
          </p>
        </div>

        {/* Subscription status */}
        <div className="mb-8 bg-white border border-gray-200 rounded-2xl px-6 py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                Subscription
              </p>
              {tierInfo && expiresAt ? (
                <>
                  <p className="text-lg font-bold text-gray-900">
                    {tierInfo.label}
                    <span className="ml-2 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-300 rounded-full px-2 py-0.5">
                      Active
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Expires{" "}
                    {expiresAt.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}{" "}
                    · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold text-gray-600">No active plan</p>
              )}
            </div>
            <button
              onClick={() => router.push("/checkout?tier=monthly")}
              className="text-xs text-gray-700 hover:text-gray-900 border border-gray-200 hover:border-brand-300 rounded-lg px-4 py-2 transition-colors"
            >
              Extend or change plan
            </button>
          </div>
        </div>

        {/* Preferences form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 bg-white border border-gray-200 rounded-2xl p-8 shadow-xl backdrop-blur-sm"
        >
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
            <label className="text-sm font-medium text-gray-700">Your goal</label>
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
                    <span className="text-sm text-gray-200">{opt.label}</span>
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
              <span className="ml-2 text-xs text-gray-400 font-normal">comma-separated</span>
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

          {/* Body Metrics */}
          <div className="flex flex-col gap-3 border border-gray-200 rounded-xl p-4 bg-brand-50/40">
            <p className="text-sm font-medium text-gray-700">Body metrics</p>

            <div className="flex gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label htmlFor="weight" className="text-xs text-gray-500">Weight</label>
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

            <div className="flex gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label htmlFor="gender" className="text-xs text-gray-500">Biological sex</label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={selectClass}
                >
                  {genderOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label htmlFor="activityLevel" className="text-xs text-gray-500">Activity level</label>
                <select
                  id="activityLevel"
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value)}
                  className={selectClass}
                >
                  {activityLevels.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="state" className="text-xs text-gray-500">
                State <span className="text-gray-400">(for grocery price estimates)</span>
              </label>
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className={selectClass}
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

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-300 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-2 w-full bg-brand-600 hover:bg-brand-700 active:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors duration-150 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving &amp; regenerating…
              </>
            ) : (
              "Update Preferences & Regenerate"
            )}
          </button>
          <p className="text-xs text-gray-400 text-center -mt-2">
            Regenerating builds a fresh plan with your updated preferences — no
            extra charge, stays on your current subscription.
          </p>
        </form>
      </div>
    </main>
  );
}
