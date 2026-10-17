-- ════════════════════════════════════════════════════════════════════════
-- TEMPORARY-PROJECT FIXTURE — minimal base schema the feature migrations depend
-- on (crm_profiles, is_crm_director(), an unrelated crm_contacts table). This is
-- applied by the validation runner ONLY when a fresh temp project lacks the base
-- CRM schema. It is NOT a production migration and must never run on production.
--
-- It deliberately recreates the PRE-FIX (vulnerable) grant shape — broad UPDATE
-- to authenticated — so that applying 0001 on top genuinely proves the fix
-- transitions a vulnerable table to a safe one.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.crm_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text,
  telegram_id text,
  phone       text,
  created_at  timestamptz not null default now()
);
alter table public.crm_profiles enable row level security;

-- Readable by any authenticated user (matches production read policy intent).
drop policy if exists crm_profiles_select on public.crm_profiles;
create policy crm_profiles_select on public.crm_profiles
  for select to authenticated using (true);

-- Pre-fix state: broad UPDATE + own-row-only USING, NO with-check / column guard.
drop policy if exists "crm_profiles_update" on public.crm_profiles;
create policy "crm_profiles_update" on public.crm_profiles
  for update to authenticated using (auth.uid() = id);
grant select on public.crm_profiles to authenticated;
grant update on public.crm_profiles to authenticated;   -- broad (vulnerable) — 0001 revokes this

-- Director check used by 0002 policies.
create or replace function public.is_crm_director()
  returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.crm_profiles
    where id = auth.uid() and role = 'director'
  );
$$;

-- Unrelated table — the runner asserts it (and its row) survives rollback.
create table if not exists public.crm_contacts (
  id   bigint generated always as identity primary key,
  name text not null
);
insert into public.crm_contacts (name)
select 'keep-me-sentinel'
where not exists (select 1 from public.crm_contacts where name = 'keep-me-sentinel');
