create table if not exists subscriptions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references profiles(id) on delete cascade,
  plan_tier        text        not null,
  plan_expires_at  timestamptz not null,
  stripe_session_id text       not null unique,
  created_at       timestamptz not null default now()
);

alter table subscriptions enable row level security;

create policy "Users can view their own subscriptions"
  on subscriptions for select
  using (auth.uid() = user_id);
