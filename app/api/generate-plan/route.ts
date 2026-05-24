import { NextRequest, NextResponse } from "next/server";
import { generatePlan } from "@/app/lib/generatePlan";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { budget, goal, diet, totalDays, stateCode, calorieTarget } = body;

  if (typeof budget !== "number" || typeof totalDays !== "number") {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  const plan = generatePlan(
    budget,
    goal ?? "",
    diet ?? "",
    totalDays,
    stateCode ?? "",
    calorieTarget ?? undefined
  );
  return NextResponse.json(plan);
}
