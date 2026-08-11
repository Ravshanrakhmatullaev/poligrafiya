-- TEMPORARY SUPABASE PROJECT ONLY.
-- The runner refuses non-empty/shared projects and creates this prerequisite
-- before applying the production-shaped PRICE migration.

begin;

create table public.crm_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  role text not null check (role in ('director', 'manager', 'designer', 'production')),
  created_at timestamptz not null default now()
);

alter table public.crm_profiles enable row level security;
revoke all on table public.crm_profiles from anon, authenticated;
grant select on table public.crm_profiles to authenticated;

create policy price_validation_crm_profiles_own_read
on public.crm_profiles
for select to authenticated
using (id = auth.uid());

-- Unrelated control object. It must survive the PRICE rollback unchanged.
create table public.price_validation_unrelated_sentinel (
  id integer primary key,
  marker text not null
);

insert into public.price_validation_unrelated_sentinel (id, marker)
values (1, 'must-survive-price-rollback');

commit;
