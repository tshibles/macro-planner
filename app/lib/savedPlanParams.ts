// Shape of the meal_plans row returned by /api/meal-plans/saved.
export interface SavedPlan {
  budget: number;
  goal: string | null;
  diet: string | null;
  diets: string[] | null;
  tier: string | null;
  number_of_people?: number | null;
  age: number | null;
  activity_level: number | null;
  allergies: string | null;
  weight_lbs: number | null;
  height_ft: number | null;
  height_in: number | null;
  gender: string | null;
  state: string | null;
  target_weight: number | null;
  goal_timeframe_weeks: number | null;
  plan_salt: number | null;
  liked_meal_ids?: string[];
  disliked_meal_ids?: string[];
}

// Builds the canonical /plan query string from a saved meal_plans row. The key
// set and insertion order must stay in sync with the param builders inside the
// plan page — its free-tier mismatch check compares serialized strings.
export function buildSavedPlanParams(
  plan: SavedPlan,
  tierOverride?: string
): URLSearchParams {
  const savedDiets: string[] = plan.diets ?? (plan.diet ? [plan.diet] : []);
  const p = new URLSearchParams({
    budget: String(plan.budget),
    goal: plan.goal ?? "",
    tier: tierOverride ?? plan.tier ?? "free",
  });
  if (plan.number_of_people) p.set("people", String(plan.number_of_people));
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
  if (plan.goal_timeframe_weeks)
    p.set("goalTimeframe", String(plan.goal_timeframe_weeks));
  return p;
}
