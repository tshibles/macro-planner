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

export function getCalorieTarget(tdee: number, goal: string): number {
  switch (goal) {
    case "muscle_gain":
      return tdee + 300;
    case "fat_loss":
      return Math.max(1200, tdee - 400);
    case "endurance":
      return tdee + 200;
    default:
      return tdee;
  }
}
