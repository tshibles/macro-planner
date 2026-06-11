export interface PlanTier {
  id: string;
  label: string;
  days: number;
  price: number;
  priceInCents: number;
  description: string;
  badge?: string;
}

export const planTiers: PlanTier[] = [
  {
    id: "free",
    label: "Free Trial",
    days: 7,
    price: 0,
    priceInCents: 0,
    description: "1 week — no payment required",
  },
  {
    id: "monthly",
    label: "Monthly",
    days: 30,
    price: 8,
    priceInCents: 800,
    description: "$8/month — 30-day plan",
    badge: "Popular",
  },
  {
    id: "annual",
    label: "Annual",
    days: 365,
    price: 60,
    priceInCents: 6000,
    description: "$60/year — 37% cheaper than monthly",
    badge: "Best Value",
  },
];

// Tier IDs from the retired pricing structure map onto the closest new tier so
// previously saved plans keep working.
const LEGACY_TIER_MAP: Record<string, string> = {
  starter: "monthly",
  committed: "monthly",
  serious: "annual",
  full_year: "annual",
};

export function getTierById(id: string): PlanTier {
  const mapped = LEGACY_TIER_MAP[id] ?? id;
  return planTiers.find((t) => t.id === mapped) ?? planTiers[0];
}
