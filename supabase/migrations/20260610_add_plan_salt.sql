-- Persisted RNG salt: paid users regenerate the exact same plan on return visits.
alter table meal_plans
  add column if not exists plan_salt integer;
