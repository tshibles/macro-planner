import { meals, Meal, DietaryFlag } from "@/app/data/meals";

export interface DayMeals {
  day: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  snack: Meal;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  dailyCost: number;
}

export interface WeekPlan {
  days: DayMeals[];
  weeklyEstimatedCost: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Simple seeded LCG for deterministic randomness
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const EXCLUDED_FLAGS: Record<string, DietaryFlag[]> = {
  vegan: ["meat", "dairy", "fish", "eggs"],
  vegetarian: ["meat", "fish"],
  gluten_free: ["gluten"],
  dairy_free: ["dairy"],
  halal: ["pork"],
  kosher: ["pork"],
};

function isAllowed(meal: Meal, diet: string): boolean {
  const excluded = EXCLUDED_FLAGS[diet] ?? [];
  return !meal.contains.some((f) => excluded.includes(f));
}

// Higher score = better fit for the goal
function scoreMeal(meal: Meal, goal: string): number {
  const proteinDensity = meal.protein / (meal.calories || 1);
  switch (goal) {
    case "muscle_gain":
      return meal.protein * 3 + proteinDensity * 200;
    case "fat_loss":
      return meal.protein * 3 - meal.calories * 0.3 + proteinDensity * 200;
    case "endurance":
      return meal.carbs * 2 + meal.calories * 0.05;
    case "maintenance":
      return meal.protein * 1.5 + meal.carbs * 0.5 - meal.fat * 0.2;
    case "general_health":
      return meal.protein * 2 - meal.fat * 0.5 + meal.carbs * 0.3;
    default:
      return 0;
  }
}

export function generatePlan(budget: number, goal: string, diet: string): WeekPlan {
  // Build a numeric seed from inputs so the same inputs always yield the same plan
  const goalIndex = ["muscle_gain", "fat_loss", "maintenance", "endurance", "general_health"].indexOf(goal) + 1;
  const dietIndex = ["", "vegetarian", "vegan", "gluten_free", "dairy_free", "halal", "kosher"].indexOf(diet) + 1;
  const seed = Math.round(budget * 100) + goalIndex * 1000 + dietIndex * 100;
  const rng = seededRng(seed);

  const byType = (type: Meal["type"]) => {
    const eligible = meals.filter((m) => m.type === type && isAllowed(m, diet));
    const sorted = eligible.sort((a, b) => scoreMeal(b, goal) - scoreMeal(a, goal));
    // Bias the shuffle toward the top half of sorted results
    const topHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
    const bottomHalf = sorted.slice(Math.ceil(sorted.length / 2));
    return [...shuffle(topHalf, rng), ...shuffle(bottomHalf, rng)];
  };

  const breakfasts = byType("breakfast");
  const lunches = byType("lunch");
  const dinners = byType("dinner");
  const snacks = byType("snack");

  // Fallback to any meal if dietary restriction wipes out options
  const safePick = (pool: Meal[], day: number): Meal =>
    pool.length > 0 ? pool[day % pool.length] : meals.filter((m) => m.type === pool[0]?.type)[0];

  const days: DayMeals[] = DAY_NAMES.map((day, i) => {
    const breakfast = safePick(breakfasts, i);
    const lunch = safePick(lunches, i);
    const dinner = safePick(dinners, i);
    const snack = safePick(snacks, i);
    return {
      day,
      breakfast,
      lunch,
      dinner,
      snack,
      dailyCalories: breakfast.calories + lunch.calories + dinner.calories + snack.calories,
      dailyProtein: breakfast.protein + lunch.protein + dinner.protein + snack.protein,
      dailyCarbs: breakfast.carbs + lunch.carbs + dinner.carbs + snack.carbs,
      dailyFat: breakfast.fat + lunch.fat + dinner.fat + snack.fat,
      dailyCost: +(breakfast.cost + lunch.cost + dinner.cost + snack.cost).toFixed(2),
    };
  });

  const weeklyEstimatedCost = +days.reduce((s, d) => s + d.dailyCost, 0).toFixed(2);
  const avgDailyCalories = Math.round(days.reduce((s, d) => s + d.dailyCalories, 0) / 7);
  const avgDailyProtein = Math.round(days.reduce((s, d) => s + d.dailyProtein, 0) / 7);

  return { days, weeklyEstimatedCost, avgDailyCalories, avgDailyProtein };
}
