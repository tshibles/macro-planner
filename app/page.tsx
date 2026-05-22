"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const fitnessGoals = [
  { value: "", label: "Select a goal..." },
  { value: "muscle_gain", label: "Build Muscle" },
  { value: "fat_loss", label: "Lose Fat" },
  { value: "maintenance", label: "Maintain Weight" },
  { value: "endurance", label: "Improve Endurance" },
  { value: "general_health", label: "General Health" },
];

const dietaryRestrictions = [
  { value: "", label: "No restrictions" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten_free", label: "Gluten-Free" },
  { value: "dairy_free", label: "Dairy-Free" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
];

export default function Home() {
  const router = useRouter();
  const [budget, setBudget] = useState("");
  const [goal, setGoal] = useState("");
  const [diet, setDiet] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({
      budget: budget || "50",
      goal,
      diet,
    });
    router.push(`/plan?${params.toString()}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-brand-500 text-xl">⚡</span>
          <span className="font-bold text-lg tracking-tight">Macro Planner</span>
        </div>
        <span className="text-xs text-gray-500 bg-white/5 px-3 py-1 rounded-full">
          Free for students
        </span>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-brand-400 text-sm font-medium">
            AI-powered meal planning
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl font-extrabold text-center leading-tight max-w-3xl">
          Eat well.{" "}
          <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
            Hit your macros.
          </span>
          <br />
          Stay on budget.
        </h1>

        {/* Subheadline */}
        <p className="mt-6 text-gray-400 text-lg sm:text-xl text-center max-w-xl leading-relaxed">
          Tell us your weekly food budget, fitness goal, and any dietary needs —
          we'll build a personalized meal plan that actually fits college life.
        </p>

        {/* Form Card */}
        <div className="mt-12 w-full max-w-lg bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Budget */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="budget"
                className="text-sm font-medium text-gray-300"
              >
                Weekly grocery budget
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                  $
                </span>
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

            {/* Fitness Goal */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="goal"
                className="text-sm font-medium text-gray-300"
              >
                Fitness goal
              </label>
              <select
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer"
              >
                {fitnessGoals.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-gray-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dietary Restrictions */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="diet"
                className="text-sm font-medium text-gray-300"
              >
                Dietary restrictions
              </label>
              <select
                id="diet"
                value={diet}
                onChange={(e) => setDiet(e.target.value)}
                className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition appearance-none cursor-pointer"
              >
                {dietaryRestrictions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-gray-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* CTA */}
            <button
              type="submit"
              className="mt-2 w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-3.5 rounded-xl transition-colors duration-150 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
            >
              Generate My Plan
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </form>
        </div>

        {/* Social proof / trust signals */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-gray-500 text-sm">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            No signup needed
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            Macro-balanced meals
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            Budget-first approach
          </span>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-xs text-gray-600 border-t border-white/5">
        © {new Date().getFullYear()} Macro Planner · Built for college students
      </footer>
    </main>
  );
}
