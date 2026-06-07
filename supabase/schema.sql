-- Eisenhower SaaS schema
-- Run in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  default_timezone text default 'Europe/Warsaw',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null default 'free',
  status text not null default 'free',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  zone text not null check (zone in ('do', 'plan', 'delegate', 'delete')),
  status text not null default 'planowane',
  due_at timestamptz,
  notes text default '',
  calendar_event_id text,
  postponed_count integer not null default 0,
  last_postponed_at timestamptz,
  completed_at timestamptz,
  source text default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript text,
  parsed jsonb,
  source text default 'pwa',
  created_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  google_event_id text,
  summary text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  reminders jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.tasks enable row level security;
alter table public.voice_intakes enable row level security;
alter table public.calendar_events enable row level security;
alter table public.focus_sessions enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

create policy "subscriptions_select_own" on public.subscriptions
  for select using (user_id = auth.uid());

create policy "tasks_select_own" on public.tasks
  for select using (user_id = auth.uid());

create policy "tasks_insert_own" on public.tasks
  for insert with check (user_id = auth.uid());

create policy "tasks_update_own" on public.tasks
  for update using (user_id = auth.uid());

create policy "tasks_delete_own" on public.tasks
  for delete using (user_id = auth.uid());

create policy "voice_intakes_select_own" on public.voice_intakes
  for select using (user_id = auth.uid());

create policy "calendar_events_select_own" on public.calendar_events
  for select using (user_id = auth.uid());

create policy "focus_sessions_select_own" on public.focus_sessions
  for select using (user_id = auth.uid());

create index if not exists tasks_user_zone_idx on public.tasks(user_id, zone);
create index if not exists tasks_user_due_idx on public.tasks(user_id, due_at);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'free')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
