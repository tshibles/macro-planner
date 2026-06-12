-- Persist household size so "# of people" survives navigation/restores and
-- the plan + grocery pages always generate with the same per-person budget.
alter table meal_plans
  add column if not exists number_of_people smallint;
