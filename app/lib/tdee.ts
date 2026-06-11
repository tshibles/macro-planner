// Mifflin-St Jeor BMR formula.

export function calculateTDEE(
  weightLbs: number,
  heightFt: number,
  heightIn: number,
  gender: string,
  age: number = 20,
  activityLevel: number = 1.55
): number {
  const weightKg = weightLbs * 0.453592;
  const heightCm = (heightFt * 12 + heightIn) * 2.54;

  const maleBmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const femaleBmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  let bmr: number;
  if (gender === "female") {
    bmr = femaleBmr;
  } else if (gender === "other") {
    bmr = (maleBmr + femaleBmr) / 2;
  } else {
    bmr = maleBmr;
  }

  return Math.round(bmr * activityLevel);
}

// ── Target-based goal system ──────────────────────────────────────────────────
// The calorie surplus/deficit is derived from how many pounds the user wants to
// gain/lose and over how many weeks (1 lb ≈ 3,500 kcal), replacing the old
// fixed per-goal offsets.

const CALS_PER_LB = 3500;
const MAX_SAFE_LOSS_PER_WEEK = 1.0; // lbs/week (safe range 0.5–1)
const MAX_SAFE_GAIN_PER_WEEK = 0.5; // lbs/week (safe range 0.25–0.5)

// Sanity bounds on the daily adjustment regardless of how aggressive the
// requested timeframe is (the form warns but still allows proceeding).
const MIN_DAILY_CALORIES = 1200;
const MAX_DAILY_SURPLUS = 1000;

export interface GoalTarget {
  weightLbs: number;
  targetWeightLbs: number;
  timeframeWeeks: number;
}

export interface GoalRateCheck {
  direction: "loss" | "gain" | "maintain";
  ratePerWeek: number;    // absolute lbs per week implied by the inputs
  maxSafeRate: number;    // safe ceiling for this direction
  safe: boolean;
  suggestedWeeks: number; // minimum weeks to stay within the safe rate
}

export function deriveGoal(weightLbs?: number, targetWeightLbs?: number): string {
  if (!weightLbs || !targetWeightLbs) return "maintenance";
  if (targetWeightLbs > weightLbs + 0.5) return "muscle_gain";
  if (targetWeightLbs < weightLbs - 0.5) return "fat_loss";
  return "maintenance";
}

export function checkGoalRate(
  weightLbs: number,
  targetWeightLbs: number,
  timeframeWeeks: number
): GoalRateCheck {
  const deltaLbs = targetWeightLbs - weightLbs;
  const direction = deltaLbs > 0.5 ? "gain" : deltaLbs < -0.5 ? "loss" : "maintain";
  const maxSafeRate = direction === "gain" ? MAX_SAFE_GAIN_PER_WEEK : MAX_SAFE_LOSS_PER_WEEK;
  const ratePerWeek = timeframeWeeks > 0 ? Math.abs(deltaLbs) / timeframeWeeks : Infinity;
  return {
    direction,
    ratePerWeek,
    maxSafeRate,
    safe: direction === "maintain" || ratePerWeek <= maxSafeRate,
    suggestedWeeks: Math.max(1, Math.ceil(Math.abs(deltaLbs) / maxSafeRate)),
  };
}

// Daily calorie surplus (positive) or deficit (negative) implied by the target.
export function getCalorieAdjustment(target: GoalTarget): number {
  const { weightLbs, targetWeightLbs, timeframeWeeks } = target;
  if (!weightLbs || !targetWeightLbs || !timeframeWeeks || timeframeWeeks <= 0) return 0;
  const deltaLbs = targetWeightLbs - weightLbs;
  return Math.round((deltaLbs * CALS_PER_LB) / (timeframeWeeks * 7));
}

export function getCalorieTarget(tdee: number, goal: string, target?: GoalTarget): number {
  if (target && target.weightLbs && target.targetWeightLbs && target.timeframeWeeks > 0) {
    const adjustment = Math.min(getCalorieAdjustment(target), MAX_DAILY_SURPLUS);
    return Math.max(MIN_DAILY_CALORIES, tdee + adjustment);
  }
  // Legacy fallback for users without a target weight/timeframe.
  switch (goal) {
    case "muscle_gain":
      return tdee + 300;
    case "fat_loss":
      return Math.max(MIN_DAILY_CALORIES, tdee - 400);
    case "endurance":
      return tdee + 200;
    default:
      return tdee;
  }
}
