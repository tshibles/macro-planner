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
    id: "starter",
    label: "Starter",
    days: 30,
    price: 10,
    priceInCents: 1000,
    description: "1 month plan",
  },
  {
    id: "committed",
    label: "Committed",
    days: 90,
    price: 20,
    priceInCents: 2000,
    description: "3 month plan",
    badge: "Popular",
  },
  {
    id: "serious",
    label: "Serious",
    days: 180,
    price: 30,
    priceInCents: 3000,
    description: "6 month plan",
  },
  {
    id: "full_year",
    label: "Full Year",
    days: 365,
    price: 40,
    priceInCents: 4000,
    description: "12 month plan",
    badge: "Best Value",
  },
];

export function getTierById(id: string): PlanTier {
  return planTiers.find((t) => t.id === id) ?? planTiers[0];
}
