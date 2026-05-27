alter table meal_plans
  add column if not exists disliked_meal_ids text[] not null default '{}';
