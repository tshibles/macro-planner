alter table meal_plans
  add column if not exists target_weight        numeric,
  add column if not exists goal_timeframe_weeks smallint;
