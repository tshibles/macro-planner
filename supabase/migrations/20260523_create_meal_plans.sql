create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  budget numeric not null,
  goal text not null default '',
  diet text not null default '',
  tier text not null default 'free',
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table meal_plans enable row level security;

create policy "Users can view their own meal plans"
  on meal_plans for select
  using (auth.uid() = user_id);

create policy "Users can insert their own meal plans"
  on meal_plans for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own meal plans"
  on meal_plans for update
  using (auth.uid() = user_id);
