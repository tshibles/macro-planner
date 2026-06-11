"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { planTiers } from "@/app/data/plans";
import { UserButton } from "@/app/components/UserButton";
import { US_STATES } from "@/app/data/stateMultipliers";
import { checkGoalRate, deriveGoal } from "@/app/lib/tdee";

const dietaryOptions = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten_free", label: "Gluten-Free" },
  { value: "dairy_free", label: "Dairy-Free" },
  { value: "pescatarian", label: "Pescatarian" },
];

const activityLevels = [
  { value: "1.2", label: "Sedentary" },
  { value: "1.375", label: "Lightly Active" },
  { value: "1.55", label: "Moderately Active" },
  { value: "1.725", label: "Very Active" },
];

const genderOptions = [
  { value: "", label: "Select..." },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export default function Home() {
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
  const [tier, setTier] = useState("free");
  const [weight, setWeight] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [gender, setGender] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [freeTrialUsed, setFreeTrialUsed] = useState(false);
  const [trialCheckDone, setTrialCheckDone] = useState(false);

  function toggleDiet(value: string) {
    setSelectedDiets((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/meal-plans/saved").then((r) => r.json()),
      fetch("/api/free-trial/status").then((r) => r.json()).catch(() => ({ used: false })),
      fetch("/api/subscriptions/status").then((r) => r.json()).catch(() => ({ unlocked: false })),
    ])
      .then(([{ plan }, statusData, subscription]) => {
        if (plan) {
          const savedDiets: string[] = plan.diets ?? (plan.diet ? [plan.diet] : []);
          const p = new URLSearchParams({
            budget: String(plan.budget),
            goal: plan.goal ?? "",
            tier: plan.tier ?? "free",
          });
          if (savedDiets.length > 0) p.set("diets", savedDiets.join(","));
          if (plan.age) p.set("age", String(plan.age));
          if (plan.activity_level) p.set("activityLevel", String(plan.activity_level));
          if (plan.allergies) p.set("allergies", plan.allergies);
          if (plan.weight_lbs) p.set("weight", String(plan.weight_lbs));
          if (plan.height_ft != null) p.set("heightFt", String(plan.height_ft));
          if (plan.height_in != null) p.set("heightIn", String(plan.height_in));
          if (plan.gender) p.set("gender", plan.gender);
          if (plan.state) p.set("state", plan.state);
          if (plan.target_weight) p.set("targetWeight", String(plan.target_weight));
          if (plan.goal_timeframe_weeks) p.set("goalTimeframe", String(plan.goal_timeframe_weeks));
          router.replace(`/plan?${p.toString()}`);
          return;
        }
        if (subscription.unlocked) {
          // Active subscription (incl. the 7-day free-trial row) but no saved
          // plan — don't gate on free_trial_used; let them generate freely.
          setTrialCheckDone(true);
          return;
        }
        const used = statusData.used ?? false;
        setFreeTrialUsed(used);
        if (used) setTier("monthly");
        setTrialCheckDone(true);
      })
      .catch(() => setTrialCheckDone(true));
  }, []);

  const selectedTier = planTiers.find((t) => t.id === tier) ?? planTiers[0];

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

  function buildParams() {
    const p = new URLSearchParams({
      budget: budget || "50",
      people: numberOfPeople || "1",
      goal,
      tier,
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
    setLoading(true);

    const params = buildParams();
    const planProps = { budget: budget || "50", goal, diets: selectedDiets, tier, weight, gender, state };

    if (selectedTier.priceInCents === 0) {
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
        setFreeTrialUsed(true);
        setTier("monthly");
        setLoading(false);
        return;
      }
      posthog.capture("plan_generated", planProps);
      router.push(`/plan?${params.toString()}`);
      return;
    }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: budget || "50",
          people: numberOfPeople || "1",
          goal,
          diets: selectedDiets,
          tier,
          age: age || "",
          activityLevel: activityLevel || "",
          allergies: allergies || "",
          weight: weight || "",
          heightFt: heightFt || "",
          heightIn: heightIn || "",
          gender: gender || "",
          state: state || "",
          targetWeight: targetWeight || "",
          goalTimeframe: goalTimeframe || "",
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.url) {
        posthog.capture("plan_generated", planProps);
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-brand-500 text-xl">⚡</span>
          <span className="font-bold text-lg tracking-tight">Macro Planner</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 bg-white/5 px-3 py-1 rounded-full hidden sm:block">
            College-friendly nutrition
          </span>
          <UserButton />
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="mb-6 inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-brand-400 text-sm font-medium">
            80-meal library with full recipes
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold text-center leading-tight max-w-3xl">
          Eat well.{" "}
          <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
            Hit your macros.
          </span>
          <br />
          Stay on budget.
        </h1>

        <p className="mt-6 text-gray-400 text-lg sm:text-xl text-center max-w-xl leading-relaxed">
          Tell us your budget, goal, and dietary needs — get a full meal plan with
          accurate macros, ingredients, and step-by-step recipes.
        </p>

        {/* Form Card */}
        <div className="mt-12 w-full max-w-lg bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Budget + People */}
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor="budget" className="text-sm font-medium text-gray-300">
                  Weekly grocery budget
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                  <input
                    id="budget"
                    type="number"
                    min={10}
                    max={500}
                    step={5}
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="50"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 w-28">
                <label htmlFor="people" className="text-sm font-medium text-gray-300">
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition"
                />
              </div>
            </div>

            {/* Goal Target */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">
                Your goal
                <span className="ml-2 text-xs text-gray-600 font-normal">
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
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-12 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
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
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-14 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">weeks</span>
                  </div>
                </div>
              </div>
              {rateCheck && rateCheck.direction !== "maintain" && (
                rateCheck.safe ? (
                  <p className="text-xs text-gray-500">
                    {rateCheck.direction === "loss" ? "Losing" : "Gaining"}{" "}
                    {Math.abs(targetWeightNum - currentWeightNum).toFixed(0)} lbs over {timeframeNum} weeks
                    (~{rateCheck.ratePerWeek.toFixed(1)} lb/week) — a healthy, sustainable pace.
                  </p>
                ) : (
                  <div className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
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
              <label className="text-sm font-medium text-gray-300">
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
                          ? "border-brand-500/60 bg-brand-500/10"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          checked ? "border-brand-500 bg-brand-500" : "border-gray-600"
                        }`}
                      >
                        {checked && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 text-white">
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
              <label htmlFor="allergies" className="text-sm font-medium text-gray-300">
                Allergies
                <span className="ml-2 text-xs text-gray-600 font-normal">comma-separated, e.g. eggs, peanuts</span>
              </label>
              <input
                id="allergies"
                type="text"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="e.g. eggs, peanuts, shellfish"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition"
              />
            </div>

            {/* Body Metrics (optional) */}
            <div className="flex flex-col gap-3 border border-white/8 rounded-xl p-4 bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-300">Body metrics</p>
                <span className="text-xs text-gray-600 bg-white/5 rounded-full px-2 py-0.5">
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-12 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
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
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-10 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
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
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-10 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
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
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer text-sm"
                  >
                    {genderOptions.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-gray-900">
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
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
                  className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer text-sm"
                >
                  {activityLevels.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-gray-900">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* State */}
              <div className="flex flex-col gap-1">
                <label htmlFor="state" className="text-xs text-gray-500">
                  State <span className="text-gray-600">(for grocery price estimates)</span>
                </label>
                <select
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer text-sm"
                >
                  <option value="" className="bg-gray-900">Select state…</option>
                  {US_STATES.map((s) => (
                    <option key={s.value} value={s.value} className="bg-gray-900">
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Plan Length */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">Plan length</label>
              {!trialCheckDone ? (
                <div className="h-[200px] rounded-xl bg-white/[0.02] border border-white/10 animate-pulse" />
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {planTiers.map((t) => {
                    const isFreeTierDisabled = t.id === "free" && freeTrialUsed;
                    return (
                      <label
                        key={t.id}
                        className={`relative flex items-center justify-between gap-3 rounded-xl px-4 py-3 border transition-all ${
                          isFreeTierDisabled
                            ? "border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
                            : tier === t.id
                            ? "border-brand-500/60 bg-brand-500/10 cursor-pointer"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                              isFreeTierDisabled
                                ? "border-gray-700"
                                : tier === t.id
                                ? "border-brand-500 bg-brand-500"
                                : "border-gray-600"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white">{t.label}</span>
                              {isFreeTierDisabled ? (
                                <span className="text-xs bg-gray-700/50 text-gray-500 border border-gray-600/30 rounded-full px-1.5 py-0.5 leading-none">
                                  Used
                                </span>
                              ) : t.badge ? (
                                <span className="text-xs bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-full px-1.5 py-0.5 leading-none">
                                  {t.badge}
                                </span>
                              ) : null}
                            </div>
                            <span className="text-xs text-gray-500">{t.description}</span>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-200 flex-shrink-0">
                          {t.price === 0 ? "Free" : `$${t.price}`}
                        </span>
                        <input
                          type="radio"
                          name="tier"
                          value={t.id}
                          checked={tier === t.id}
                          disabled={isFreeTierDisabled}
                          onChange={() => !isFreeTierDisabled && setTier(t.id)}
                          className="sr-only"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {freeTrialUsed && (
              <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                Your free trial has been used. Choose a plan above to continue.
              </p>
            )}

            {/* CTA */}
            <button
              type="submit"
              disabled={loading || !trialCheckDone}
              className="mt-2 w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors duration-150 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {selectedTier.priceInCents > 0 ? "Redirecting to checkout…" : "Building your plan…"}
                </>
              ) : (
                <>
                  {selectedTier.priceInCents > 0
                    ? `Get ${selectedTier.days}-Day Plan — $${selectedTier.price}`
                    : "Generate Free 7-Day Plan"}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Trust signals */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-gray-500 text-sm">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            USDA-verified macros
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            80 real recipes with steps
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            Budget-first approach
          </span>
        </div>
      </section>

      <footer className="px-6 py-4 text-center text-xs text-gray-600 border-t border-white/5">
        © {new Date().getFullYear()} Macro Planner · Built for college students
      </footer>
    </main>
  );
}
