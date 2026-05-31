alter table meal_plans
  add column if not exists age            smallint,
  add column if not exists activity_level numeric,
  add column if not exists allergies      text,
  add column if not exists diets          text[];
