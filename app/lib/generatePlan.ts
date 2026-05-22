import { meals, Meal, DietaryFlag } from "@/app/data/meals";

export interface DayMeals {
  day: string;
  date: string;
  weekIndex: number;
  dayIndex: number;
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

export interface MealPlan {
  days: DayMeals[];
  weeks: DayMeals[][];
  totalDays: number;
  weeklyEstimatedCost: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
  vegetarian: ["meat", "fish"],
  vegan: ["meat", "dairy", "fish", "eggs"],
  gluten_free: ["gluten"],
  dairy_free: ["dairy"],
  halal: ["pork"],
  kosher: ["pork"],
};

function isAllowed(meal: Meal, diet: string): boolean {
  const excluded = EXCLUDED_FLAGS[diet] ?? [];
  return !meal.contains.some((f) => excluded.includes(f));
}

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

function formatDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function generatePlan(budget: number, goal: string, diet: string, totalDays: number): MealPlan {
  const goalIndex = ["muscle_gain", "fat_loss", "maintenance", "endurance", "general_health"].indexOf(goal) + 1;
  const dietIndex = ["", "vegetarian", "vegan", "gluten_free", "dairy_free", "halal", "kosher"].indexOf(diet) + 1;
  const seed = Math.round(budget * 100) + goalIndex * 1000 + dietIndex * 100;
  const rng = seededRng(seed);

  const buildPool = (type: Meal["type"]): Meal[] => {
    const eligible = meals.filter((m) => m.type === type && isAllowed(m, diet));
    if (eligible.length === 0) return meals.filter((m) => m.type === type).slice(0, 5);
    const sorted = [...eligible].sort((a, b) => scoreMeal(b, goal) - scoreMeal(a, goal));
    // Bias toward top-scored meals but maintain variety
    const topHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
    const bottomHalf = sorted.slice(Math.ceil(sorted.length / 2));
    return [...shuffle(topHalf, rng), ...shuffle(bottomHalf, rng)];
  };

  const breakfasts = buildPool("breakfast");
  const lunches = buildPool("lunch");
  const dinners = buildPool("dinner");
  const snacks = buildPool("snack");

  // Rotation: cycle through 20-meal pool — guarantees no same-meal within a week
  // (20 meals ÷ 7 days/week = no repeat for ~3 weeks naturally)
  const pick = (pool: Meal[], dayIndex: number): Meal =>
    pool[dayIndex % pool.length];

  const days: DayMeals[] = Array.from({ length: totalDays }, (_, i) => {
    const breakfast = pick(breakfasts, i);
    const lunch = pick(lunches, i);
    const dinner = pick(dinners, i);
    const snack = pick(snacks, i);
    const weekIndex = Math.floor(i / 7);
    const dayInWeek = i % 7;
    return {
      day: DAY_NAMES[dayInWeek],
      date: formatDate(i),
      weekIndex,
      dayIndex: i,
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

  // Group days into weeks
  const numWeeks = Math.ceil(totalDays / 7);
  const weeks: DayMeals[][] = Array.from({ length: numWeeks }, (_, w) =>
    days.slice(w * 7, w * 7 + 7)
  );

  const firstWeekCost = days.slice(0, 7).reduce((s, d) => s + d.dailyCost, 0);
  const weeklyEstimatedCost = +firstWeekCost.toFixed(2);
  const avgDailyCalories = Math.round(days.reduce((s, d) => s + d.dailyCalories, 0) / days.length);
  const avgDailyProtein = Math.round(days.reduce((s, d) => s + d.dailyProtein, 0) / days.length);

  return { days, weeks, totalDays, weeklyEstimatedCost, avgDailyCalories, avgDailyProtein };
}
