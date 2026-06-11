alter table meal_plans
  add column if not exists liked_meal_ids text[] not null default '{}';
