-- Version-control the profiles RLS posture (security audit M1). The live
-- database likely already has RLS + policies set via the dashboard; this
-- migration is idempotent so it's safe to apply there, and it guarantees a
-- fresh database gets the same protection.

-- Idempotent: enabling RLS on a table that already has it is a no-op.
alter table profiles enable row level security;

-- Users can read only their own profile (free-trial status check).
drop policy if exists "Users can view their own profile" on profiles;
create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

-- Users can update only their own profile (marking the trial used).
drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users can insert only their own profile row. Required by the app: the
-- free-trial route upserts profiles with the USER-SESSION client, which
-- inserts the row on first use — without this policy that flow breaks on a
-- database built solely from migrations.
drop policy if exists "Users can insert their own profile" on profiles;
create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);
