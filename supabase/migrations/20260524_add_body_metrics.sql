alter table meal_plans
  add column if not exists weight_lbs  numeric,
  add column if not exists height_ft   smallint,
  add column if not exists height_in   smallint,
  add column if not exists gender      text,
  add column if not exists state       text,
  add column if not exists grocery_list jsonb;
