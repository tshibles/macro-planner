import { NextRequest, NextResponse } from "next/server";

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1/foods/search";

interface UsdaMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
}

// Nutrient IDs in USDA FoodData Central
const NUTRIENT = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
} as const;

export async function GET(req: NextRequest): Promise<NextResponse<UsdaMacros | { error: string }>> {
  const query = req.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "query param required" }, { status: 400 });
  }

  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "USDA API key not configured" }, { status: 500 });
  }

  try {
    // Prefer FNDDS (survey foods) which covers prepared/composite meals
    const url = new URL(USDA_BASE);
    url.searchParams.set("query", query);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("dataType", "Survey (FNDDS)");
    url.searchParams.set("pageSize", "1");

    let res = await fetch(url.toString(), { next: { revalidate: 86400 } });
    let data = await res.json();

    // Fall back to Foundation + SR Legacy if no FNDDS result
    if (!data.foods || data.foods.length === 0) {
      url.searchParams.set("dataType", "Foundation,SR Legacy");
      res = await fetch(url.toString(), { next: { revalidate: 86400 } });
      data = await res.json();
    }

    if (!data.foods || data.foods.length === 0) {
      return NextResponse.json({ error: "No results found" }, { status: 404 });
    }

    const food = data.foods[0];
    const nutrients: Record<number, number> = {};
    for (const n of food.foodNutrients ?? []) {
      nutrients[n.nutrientId] = n.value ?? 0;
    }

    const macros: UsdaMacros = {
      calories: Math.round(nutrients[NUTRIENT.calories] ?? 0),
      protein: Math.round(nutrients[NUTRIENT.protein] ?? 0),
      carbs: Math.round(nutrients[NUTRIENT.carbs] ?? 0),
      fat: Math.round(nutrients[NUTRIENT.fat] ?? 0),
      source: food.description ?? query,
    };

    return NextResponse.json(macros);
  } catch {
    return NextResponse.json({ error: "Failed to fetch USDA data" }, { status: 500 });
  }
}
