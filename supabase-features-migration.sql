
begin;

alter table public.tasks
  add column if not exists assignee text not null default '',
  add column if not exists labels text[] not null default '{}'::text[];

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create unique index if not exists labels_user_name_idx
  on public.labels (user_id, lower(trim(name)));

alter table public.labels enable row level security;
grant select, insert, update, delete on public.labels to authenticated;

drop policy if exists "Users can read their own labels" on public.labels;
create policy "Users can read their own labels" on public.labels
  for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own labels" on public.labels;
create policy "Users can create their own labels" on public.labels
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own labels" on public.labels;
create policy "Users can update their own labels" on public.labels
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own labels" on public.labels;
create policy "Users can delete their own labels" on public.labels
  for delete using (auth.uid() = user_id);

commit;
