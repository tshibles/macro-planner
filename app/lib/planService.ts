import { generatePlan, MealPlan, MealSwap } from "@/app/lib/generatePlan";
import { createClient } from "@/app/lib/supabase/server";

type SupabaseServerClient = ReturnType<typeof createClient>;

// Plan-generation parameters as sent by the plan/grocery pages and swap UI.
export interface PlanRequestParams {
  budget: number;
  goal?: string;
  diets?: string[];
  allergies?: string[];
  totalDays: number;
  stateCode?: string;
  numberOfPeople?: number;
  calorieTarget?: number;
  planSalt?: number;
  weightLbs?: number;
}

export interface StoredSwaps {
  salt: number;
  swaps: MealSwap[];
}

export interface UserPlanData {
  dislikedIds: string[];
  likedIds: string[];
  savedSalt: number | null;
  savedSwaps: StoredSwaps | null;
}

export async function loadUserPlanData(
  supabase: SupabaseServerClient,
  userId: string
): Promise<UserPlanData> {
  const { data } = await supabase
    .from("meal_plans")
    .select("disliked_meal_ids, liked_meal_ids, plan_salt, meal_swaps")
    .eq("user_id", userId)
    .single();
  return {
    dislikedIds: data?.disliked_meal_ids ?? [],
    likedIds: data?.liked_meal_ids ?? [],
    savedSalt: data?.plan_salt ?? null,
    savedSwaps: data?.meal_swaps ?? null,
  };
}

// Single entry point for plan generation: applies the user's disliked/liked
// exclusions and any swaps stored against this salt. Liked meals are excluded
// only from FRESH generations (a salt other than the saved plan's) — never
// from the regeneration of a persisted plan they may already be part of.
export function generatePlanForRequest(
  params: PlanRequestParams,
  userData: UserPlanData | null
): MealPlan {
  const planSalt = typeof params.planSalt === "number" ? params.planSalt : 0;
  const isSavedPlan = userData?.savedSalt != null && userData.savedSalt === planSalt;
  const excludedIds = [
    ...(userData?.dislikedIds ?? []),
    ...(isSavedPlan ? [] : userData?.likedIds ?? []),
  ];
  const swaps =
    userData?.savedSwaps && userData.savedSwaps.salt === planSalt
      ? userData.savedSwaps.swaps
      : [];

  return generatePlan(
    params.budget,
    params.goal ?? "",
    Array.isArray(params.diets) ? params.diets : [],
    params.totalDays,
    params.stateCode ?? "",
    typeof params.numberOfPeople === "number" ? params.numberOfPeople : 1,
    params.calorieTarget ?? undefined,
    excludedIds,
    planSalt,
    Array.isArray(params.allergies) ? params.allergies : [],
    typeof params.weightLbs === "number" ? params.weightLbs : undefined,
    swaps
  );
}
