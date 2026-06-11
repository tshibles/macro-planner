-- User-initiated meal swaps, stored as { salt: number, swaps: [{ dayIndex, slot, mealId }] }.
-- Swaps are only applied when regenerating with the same plan salt they were made
-- against; a fresh salt (new plan) discards them.
alter table meal_plans
  add column if not exists meal_swaps jsonb;
