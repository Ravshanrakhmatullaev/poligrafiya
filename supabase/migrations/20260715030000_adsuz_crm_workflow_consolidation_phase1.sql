-- ═══════════════════════════════════════
-- ADSUZ PLATFORM CONSOLIDATION — PHASE 1 (DESIGN DRAFT — NOT APPLIED)
--
-- Creates the CRM (D:\AdsUZ\ads-uz-crm) tables and the Workflow Engine V1
-- tables/RPCs inside poligrafiya's Supabase project (jxxmbgmbaqausqunfyna),
-- per CONSOLIDATION_PLAN.md and SCHEMA_CONFLICT_REPORT.md.
--
-- Scope of this phase, exactly:
--   - Schema + RLS only. No data moved (CONSOLIDATION_PLAN.md Phase 3 is
--     separate). No seed rows inserted.
--   - Every CRM-origin table is created with a crm_ prefix (see
--     SCHEMA_CONFLICT_REPORT.md §"Summary table" — profiles is a hard
--     collision with ERP's own `profiles`; the rest are prefixed for
--     consistency even though they don't collide by name).
--   - Workflow tables/enum/RPCs are created unprefixed (confirmed zero
--     collision in SCHEMA_CONFLICT_REPORT.md §8), with
--     workflow_orders.order_id -> crm_orders(id) — NOT the old CRM
--     project's `orders` table, which this migration never references.
--   - NOTHING in ERP's existing 15 tables, 8 functions, or RLS policies is
--     altered, dropped, or renamed. No FK anywhere in this file points at
--     ERP's `public.profiles` or `public.zakazlar` (per explicit
--     requirement — see CONSOLIDATION_PLAN.md §4 for why `zakazlar` is
--     deliberately never referenced: it is a per-shift staff batch record,
--     not a per-customer order, and bridging it here would be incorrect).
--   - This migration is NOT idempotent/rerunnable by design (plain CREATE,
--     no `IF NOT EXISTS`/`ON CONFLICT DO NOTHING` at the table level) — but
--     it explicitly pre-checks for name collisions before creating
--     anything, so a second run (or an unexpected pre-existing object)
--     fails loudly instead of silently corrupting state.
-- ═══════════════════════════════════════

-- ── 0. PRE-FLIGHT COLLISION CHECK ──
-- Fails the whole migration before any CREATE runs if any target object
-- name is already taken. This is what makes "not rerunnable" safe: a
-- second accidental apply attempt aborts here instead of half-applying.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('crm_profiles','crm_contacts','crm_orders','crm_payments','crm_stage_logs',
                          'workflow_templates','workflow_template_steps','workflow_orders','workflow_status_history')
  ) then
    raise exception 'adsuz_crm_workflow_consolidation_phase1: a target table already exists — aborting';
  end if;

  if exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'crm_orders_with_payments'
  ) then
    raise exception 'adsuz_crm_workflow_consolidation_phase1: crm_orders_with_payments view already exists — aborting';
  end if;

  if exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'workflow_status'
  ) then
    raise exception 'adsuz_crm_workflow_consolidation_phase1: workflow_status type already exists — aborting';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'is_crm_user', 'is_crm_director', '_workflow_is_allowed_transition', 'workflow_create_for_order',
      'workflow_transition', 'workflow_get_progress', 'workflow_get_public_progress',
      'workflow_update_production_progress', 'workflow_get_timeline',
      'crm_generate_order_number'
    )
  ) then
    raise exception 'adsuz_crm_workflow_consolidation_phase1: a target function name already exists — aborting';
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════
-- PART A — CRM TABLES (crm_ prefixed; mirrors D:\AdsUZ\ads-uz-crm\lib\schema.sql
-- exactly in shape, renamed per SCHEMA_CONFLICT_REPORT.md)
-- ══════════════════════════════════════════════════════════════

-- 1. CRM_PROFILES (CRM staff) — id is the SAME auth.users(id) space ERP uses.
-- Hard collision with ERP's own `profiles` (different shape, no RLS) is why
-- this is prefixed rather than reusing that table — see
-- SCHEMA_CONFLICT_REPORT.md §1. Never references ERP's `profiles`.
create table crm_profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  full_name   text not null,
  role        text not null check (role in ('director','manager','designer','production')),
  telegram_id text,
  phone       text,
  created_at  timestamptz not null default now()
);

-- 2. CRM_CONTACTS (mijozlar)
create table crm_contacts (
  id                 uuid default gen_random_uuid() primary key,
  name               text not null,
  company            text,
  phone              text not null,
  telegram_username  text,
  source             text default 'other',
  assigned_to        uuid references crm_profiles(id),
  is_vip             boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now()
);

-- 3. CRM_ORDERS (zakazlar/lidlar — CRM's own per-customer order entity;
-- do not confuse with ERP's `zakazlar`, a per-shift staff batch record —
-- see CONSOLIDATION_PLAN.md §4)
create table crm_orders (
  id             uuid default gen_random_uuid() primary key,
  order_number   text unique not null,       -- Z-018, L-038
  contact_id     uuid references crm_contacts(id) on delete cascade,
  assigned_to    uuid references crm_profiles(id),
  stage          text not null default 'unsorted'
                 check (stage in ('unsorted','new_lead','second_contact',
                                   'info_given','payment_await','design',
                                   'production','ready')),
  product        text,
  dimensions     text,
  quantity       integer not null default 1,
  deadline       date,
  address        text,
  total_amount   bigint not null default 0,  -- so'mda
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create sequence crm_order_number_seq start 1;

create or replace function crm_generate_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'Z-' || lpad(nextval('crm_order_number_seq')::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger crm_set_order_number
  before insert on crm_orders
  for each row execute function crm_generate_order_number();

create trigger crm_set_updated_at
  before update on crm_orders
  for each row execute function crm_generate_order_number();

-- 4. CRM_PAYMENTS (to'lovlar)
create table crm_payments (
  id             uuid default gen_random_uuid() primary key,
  order_id       uuid references crm_orders(id) on delete cascade,
  amount         bigint not null,
  method         text not null check (method in ('cash','card','transfer')),
  transaction_id text,
  file_url       text,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by    uuid references crm_profiles(id),
  created_by     uuid references crm_profiles(id),
  paid_at        timestamptz not null default now(),
  notes          text,
  created_at     timestamptz not null default now()
);

-- 5. CRM_STAGE_LOGS (bosqich tarixi)
create table crm_stage_logs (
  id          uuid default gen_random_uuid() primary key,
  order_id    uuid references crm_orders(id) on delete cascade,
  from_stage  text,
  to_stage    text not null,
  changed_by  uuid references crm_profiles(id),
  note        text,
  created_at  timestamptz not null default now()
);

-- 6. CRM_ORDERS_WITH_PAYMENTS — a plain VIEW, not a table (requirement #9)
create view crm_orders_with_payments as
select
  o.*,
  coalesce(sum(p.amount) filter (where p.status = 'approved'), 0) as total_paid,
  o.total_amount - coalesce(sum(p.amount) filter (where p.status = 'approved'), 0) as total_debt,
  case
    when o.total_amount = 0 then 0
    else round(
      coalesce(sum(p.amount) filter (where p.status = 'approved'), 0) * 100.0 / o.total_amount
    )
  end as payment_pct
from crm_orders o
left join crm_payments p on p.order_id = o.id
group by o.id;

-- ── CRM RLS ──
-- Adjustment vs. the original CRM schema.sql (flagged explicitly, not a
-- silent change): the original policies used `auth.role() = 'authenticated'`
-- for contacts/payments/stage_logs INSERT and SELECT, which was safe in
-- CRM's OLD, separate Supabase project (every authenticated user there WAS,
-- by definition, a CRM user). In the CONSOLIDATED project, "authenticated"
-- also includes every ERP staff member (dizayner/ishlab/uvdtf/etc.) who has
-- no business seeing CRM customer/payment data. `is_crm_user()` (any row in
-- crm_profiles) replaces the bare authenticated check everywhere it was
-- used, closing that gap. Nothing else about the original policy logic
-- changes.
create or replace function is_crm_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from crm_profiles where id = auth.uid());
$$;
revoke execute on function is_crm_user() from public;
revoke execute on function is_crm_user() from anon;
grant execute on function is_crm_user() to authenticated;

-- FIX (runtime validation, round 2): crm_profiles_select originally did
-- `EXISTS (SELECT 1 FROM crm_profiles WHERE ...)` directly inside a policy
-- ON crm_profiles itself — a self-referencing subquery. For any non-
-- BYPASSRLS role (i.e. anon/authenticated, exactly the roles this matters
-- for), evaluating that subquery re-triggers the same policy on the same
-- table, causing "infinite recursion detected in policy for relation
-- crm_profiles" — confirmed by transactional runtime testing. is_crm_user()
-- was never the problem (it's SECURITY DEFINER, so it bypasses RLS
-- internally when it queries crm_profiles — same reason ERP's own
-- is_owner()/is_attendance_staff() helpers never self-reference-recurse).
-- is_crm_director() follows that exact same, already-proven-safe pattern.
create or replace function is_crm_director()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'director' from crm_profiles where id = auth.uid()), false);
$$;
revoke execute on function is_crm_director() from public;
revoke execute on function is_crm_director() from anon;
grant execute on function is_crm_director() to authenticated;

alter table crm_profiles     enable row level security;
alter table crm_contacts     enable row level security;
alter table crm_orders       enable row level security;
alter table crm_payments     enable row level security;
alter table crm_stage_logs   enable row level security;

create policy "crm_profiles_select" on crm_profiles for select
  using (auth.uid() = id or is_crm_director());
create policy "crm_profiles_update" on crm_profiles for update
  using (auth.uid() = id);

create policy "crm_contacts_select" on crm_contacts for select using (is_crm_user());
create policy "crm_contacts_insert" on crm_contacts for insert with check (is_crm_user());
create policy "crm_contacts_update" on crm_contacts for update using (is_crm_user());

create policy "crm_orders_select" on crm_orders for select
  using (
    auth.uid() = assigned_to or
    exists (select 1 from crm_profiles where id = auth.uid() and role in ('director','designer','production'))
  );
create policy "crm_orders_insert" on crm_orders for insert with check (is_crm_user());
create policy "crm_orders_update" on crm_orders for update
  using (
    auth.uid() = assigned_to or
    is_crm_director()
  );

create policy "crm_payments_select" on crm_payments for select
  using (
    auth.uid() = created_by or
    is_crm_director()
  );
create policy "crm_payments_insert" on crm_payments for insert with check (is_crm_user());
create policy "crm_payments_update" on crm_payments for update
  using (is_crm_director());

create policy "crm_stage_logs_select" on crm_stage_logs for select using (is_crm_user());
create policy "crm_stage_logs_insert" on crm_stage_logs for insert with check (is_crm_user());

-- ── CRM explicit table/sequence privileges ──
-- Supabase's default ACL on THIS project auto-grants full (arwdDxtm) table
-- privileges and function EXECUTE to anon/authenticated for every new
-- object created by `postgres` (confirmed empirically via pg_default_acl
-- during runtime validation — the same reason ERP's own davomat migrations
-- explicitly revoke-then-grant instead of relying on it). RLS alone would
-- still have blocked unauthorized rows, but leaving the raw table grant in
-- place is inconsistent with ERP's established convention and weaker
-- defense-in-depth. Explicit revoke-then-grant, matching that convention:
revoke all on table crm_profiles, crm_contacts, crm_orders, crm_payments, crm_stage_logs, crm_orders_with_payments
  from public, anon;
revoke all on table crm_profiles, crm_contacts, crm_orders, crm_payments, crm_stage_logs, crm_orders_with_payments
  from authenticated;

-- crm_profiles: no INSERT grant — the original CRM schema never allowed
-- self-service profile creation either (staff profiles are provisioned by
-- an admin/service-role flow, not a client INSERT).
grant select, update on crm_profiles to authenticated;
grant select, insert, update on crm_contacts to authenticated;
grant select, insert, update on crm_orders to authenticated;
grant select, insert, update on crm_payments to authenticated;
grant select, insert on crm_stage_logs to authenticated;
grant select on crm_orders_with_payments to authenticated;

-- crm_generate_order_number() is a plain (non-SECURITY DEFINER) trigger
-- function, so nextval() during a client-side INSERT on crm_orders runs
-- under the INVOKING role's privileges, not the function owner's — the
-- inserting role needs USAGE on the sequence directly, or order creation
-- from the CRM browser client would fail with "permission denied for
-- sequence crm_order_number_seq".
revoke all on sequence crm_order_number_seq from public, anon;
grant usage on sequence crm_order_number_seq to authenticated;

-- ══════════════════════════════════════════════════════════════
-- PART B — WORKFLOW ENGINE V1 (unprefixed — zero collision confirmed;
-- order_id -> crm_orders(id), never the old CRM project's `orders`)
-- ══════════════════════════════════════════════════════════════

create type workflow_status as enum (
  'NEW', 'DESIGN', 'APPROVED', 'PRODUCTION', 'QUALITY_CONTROL',
  'READY', 'DELIVERED', 'PICKED_UP', 'COMPLETED'
);

create table workflow_templates (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  code        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table workflow_template_steps (
  id               uuid default gen_random_uuid() primary key,
  template_id      uuid not null references workflow_templates(id) on delete cascade,
  status           workflow_status not null,
  sort_order       integer not null,
  min_progress     integer not null check (min_progress between 0 and 100),
  max_progress     integer not null check (max_progress between 0 and 100),
  duration_weight  numeric not null default 1 check (duration_weight > 0),
  notify_client    boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (template_id, status),
  unique (template_id, sort_order),
  check (max_progress >= min_progress)
);

-- One workflow per crm_orders row, enforced by unique(order_id).
create table workflow_orders (
  id                          uuid default gen_random_uuid() primary key,
  order_id                    uuid not null unique references crm_orders(id) on delete cascade,
  template_id                 uuid not null references workflow_templates(id),
  current_status              workflow_status not null default 'NEW',
  current_progress            integer not null default 0 check (current_progress between 0 and 100),
  started_at                  timestamptz not null default now(),
  promised_at                 timestamptz not null,
  total_promised_minutes      integer not null check (total_promised_minutes > 0),
  status_started_at           timestamptz not null default now(),
  production_manual_progress  integer check (production_manual_progress is null or production_manual_progress between 0 and 100),
  production_completed_steps  integer check (production_completed_steps is null or production_completed_steps >= 0),
  production_total_steps      integer check (production_total_steps is null or production_total_steps > 0),
  public_token                uuid not null default gen_random_uuid() unique,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  completed_at                timestamptz
);

create index idx_workflow_orders_status on workflow_orders(current_status);

create table workflow_status_history (
  id                  uuid default gen_random_uuid() primary key,
  workflow_order_id   uuid not null references workflow_orders(id) on delete cascade,
  from_status         workflow_status,
  to_status           workflow_status not null,
  progress_before     integer,
  progress_after      integer,
  changed_by          uuid references crm_profiles(id),   -- NULL for ERP/service-role-originated writes
  source_system       text not null,                        -- 'crm' | 'erp' | ...
  actor_reference     text,
  note                text,
  created_at          timestamptz not null default now()
);

create index idx_workflow_history_order on workflow_status_history(workflow_order_id, created_at);

-- ── Workflow RLS — rebuilt against crm_orders/crm_profiles ──
alter table workflow_templates      enable row level security;
alter table workflow_template_steps enable row level security;
alter table workflow_orders         enable row level security;
alter table workflow_status_history enable row level security;

create policy "workflow_templates_select" on workflow_templates for select
  using (is_crm_user());
create policy "workflow_templates_write_director" on workflow_templates for all
  using (is_crm_director())
  with check (is_crm_director());

create policy "workflow_template_steps_select" on workflow_template_steps for select
  using (is_crm_user());
create policy "workflow_template_steps_write_director" on workflow_template_steps for all
  using (is_crm_director())
  with check (is_crm_director());

create policy "workflow_orders_select" on workflow_orders for select
  using (
    exists (
      select 1 from crm_orders o where o.id = workflow_orders.order_id and (
        auth.uid() = o.assigned_to or
        exists (select 1 from crm_profiles where id = auth.uid() and role in ('director','designer','production'))
      )
    )
  );

create policy "workflow_status_history_select" on workflow_status_history for select
  using (
    exists (
      select 1 from workflow_orders wo join crm_orders o on o.id = wo.order_id
      where wo.id = workflow_status_history.workflow_order_id and (
        auth.uid() = o.assigned_to or
        exists (select 1 from crm_profiles where id = auth.uid() and role in ('director','designer','production'))
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy on workflow_orders / workflow_status_history
-- at all — by omission, RLS denies every direct client write. Only the
-- SECURITY DEFINER RPCs below can write.

-- ── Workflow explicit table privileges ──
-- Per explicit requirement: authenticated gets NO write grant on any
-- workflow_* table — all writes go through the SECURITY DEFINER RPCs below
-- (which don't need table-level grants themselves, since they execute with
-- their owner's privileges). This intentionally means
-- workflow_templates_write_director / workflow_template_steps_write_director
-- (the RLS policies above) have no direct client path to reach them right
-- now — template management is expected to happen via service_role or a
-- future dedicated RPC (not built this phase), never via the browser
-- client's authenticated key.
revoke all on table workflow_templates, workflow_template_steps, workflow_orders, workflow_status_history
  from public, anon;
revoke all on table workflow_templates, workflow_template_steps, workflow_orders, workflow_status_history
  from authenticated;

grant select on workflow_templates to authenticated;
grant select on workflow_template_steps to authenticated;
grant select on workflow_orders to authenticated;
grant select on workflow_status_history to authenticated;

-- ── Workflow RPCs (6 approved + 1 private helper) ──

-- FIX (runtime validation, round 2): the original row-value CASE ((p_from,
-- p_to) WHEN ('NEW','DESIGN') ...) failed at runtime with "cannot compare
-- dissimilar column types workflow_status and unknown at record column 1"
-- — Postgres does not reliably resolve bare string literals inside a row
-- constructor to the enum type of the compared row. Plain boolean
-- comparisons (scalar `p_from = 'NEW'`) resolve the enum cast correctly and
-- have no such issue.
create or replace function _workflow_is_allowed_transition(p_from workflow_status, p_to workflow_status)
returns boolean
language sql immutable
as $$
  select
    (p_from = 'NEW' and p_to = 'DESIGN')
    or (p_from = 'DESIGN' and p_to = 'APPROVED')
    or (p_from = 'APPROVED' and p_to = 'PRODUCTION')
    or (p_from = 'PRODUCTION' and p_to = 'QUALITY_CONTROL')
    or (p_from = 'QUALITY_CONTROL' and p_to = 'READY')
    or (p_from = 'READY' and p_to = 'DELIVERED')
    or (p_from = 'READY' and p_to = 'PICKED_UP')
    or (p_from = 'DELIVERED' and p_to = 'COMPLETED')
    or (p_from = 'PICKED_UP' and p_to = 'COMPLETED')
    or (p_from = 'QUALITY_CONTROL' and p_to = 'PRODUCTION');  -- backward, note enforced in workflow_transition
$$;
revoke execute on function _workflow_is_allowed_transition(workflow_status, workflow_status) from public;

-- 1) workflow_create_for_order — exactly one workflow per crm_orders row.
-- p_promised_at is MANDATORY, no fallback of any kind (not orders.deadline,
-- not 18:00, not midnight) — see prior sprint's deadline-rule decision.
create or replace function workflow_create_for_order(
  p_order_id       uuid,
  p_promised_at    timestamptz,
  p_template_code  text default 'default'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order crm_orders%rowtype;
  v_template_id uuid;
  v_started_at timestamptz := now();
  v_total_promised_minutes int;
  v_row workflow_orders%rowtype;
begin
  if p_promised_at is null then
    return jsonb_build_object('ok', false, 'reason', 'promised_at_required',
      'message', 'promised_at majburiy');
  end if;

  select * into v_order from crm_orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found', 'message', 'Buyurtma topilmadi');
  end if;

  select id into v_template_id from workflow_templates where code = p_template_code and is_active = true;
  if v_template_id is null then
    return jsonb_build_object('ok', false, 'reason', 'template_not_found',
      'message', 'Shablon topilmadi: ' || p_template_code);
  end if;

  if p_promised_at <= v_started_at then
    return jsonb_build_object('ok', false, 'reason', 'invalid_promised_at',
      'message', 'promised_at hozirgi vaqtdan keyin bo''lishi kerak');
  end if;

  v_total_promised_minutes := ceil(extract(epoch from (p_promised_at - v_started_at)) / 60)::int;

  insert into workflow_orders (order_id, template_id, started_at, promised_at, total_promised_minutes)
  values (p_order_id, v_template_id, v_started_at, p_promised_at, v_total_promised_minutes)
  on conflict (order_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'already_exists',
      'message', 'Bu buyurtma uchun workflow allaqachon mavjud');
  end if;

  insert into workflow_status_history (workflow_order_id, from_status, to_status, progress_before, progress_after, changed_by, source_system, note)
  values (v_row.id, null, 'NEW', null, 0, auth.uid(), 'crm', 'created');

  return jsonb_build_object('ok', true, 'workflow_order_id', v_row.id, 'public_token', v_row.public_token,
    'status', v_row.current_status, 'progress', v_row.current_progress,
    'promised_at', v_row.promised_at, 'total_promised_minutes', v_row.total_promised_minutes);
end;
$$;
revoke execute on function workflow_create_for_order(uuid, timestamptz, text) from public;
revoke execute on function workflow_create_for_order(uuid, timestamptz, text) from anon;
grant execute on function workflow_create_for_order(uuid, timestamptz, text) to authenticated;

-- 2) workflow_transition — validated status change + timeline write.
create or replace function workflow_transition(
  p_workflow_order_id  uuid,
  p_next_status        workflow_status,
  p_note               text default null,
  p_source_system      text default 'crm',
  p_actor_reference    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wf workflow_orders%rowtype;
  v_step workflow_template_steps%rowtype;
  v_new_progress int;
begin
  select * into v_wf from workflow_orders where id = p_workflow_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Workflow topilmadi');
  end if;

  if v_wf.current_status = 'COMPLETED' then
    return jsonb_build_object('ok', false, 'reason', 'already_completed', 'message', 'Workflow allaqachon yakunlangan');
  end if;

  if not _workflow_is_allowed_transition(v_wf.current_status, p_next_status) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition',
      'message', v_wf.current_status || ' -> ' || p_next_status || ' ruxsat etilmagan');
  end if;

  if v_wf.current_status = 'QUALITY_CONTROL' and p_next_status = 'PRODUCTION'
     and (p_note is null or length(trim(p_note)) = 0) then
    return jsonb_build_object('ok', false, 'reason', 'note_required',
      'message', 'QUALITY_CONTROL -> PRODUCTION uchun sabab majburiy');
  end if;

  select * into v_step from workflow_template_steps
    where template_id = v_wf.template_id and status = p_next_status;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'step_not_configured',
      'message', 'Shablonda bu status uchun qadam sozlanmagan: ' || p_next_status);
  end if;

  v_new_progress := case when p_next_status = 'COMPLETED' then 100 else v_step.min_progress end;

  insert into workflow_status_history (
    workflow_order_id, from_status, to_status, progress_before, progress_after,
    changed_by, source_system, actor_reference, note
  ) values (
    v_wf.id, v_wf.current_status, p_next_status, v_wf.current_progress, v_new_progress,
    auth.uid(), p_source_system, p_actor_reference, p_note
  );

  update workflow_orders set
    current_status = p_next_status,
    current_progress = v_new_progress,
    status_started_at = now(),
    updated_at = now(),
    completed_at = case when p_next_status = 'COMPLETED' then now() else completed_at end
  where id = v_wf.id;

  return jsonb_build_object('ok', true, 'status', p_next_status, 'progress', v_new_progress);
end;
$$;
revoke execute on function workflow_transition(uuid, workflow_status, text, text, text) from public;
revoke execute on function workflow_transition(uuid, workflow_status, text, text, text) from anon;
grant execute on function workflow_transition(uuid, workflow_status, text, text, text) to authenticated;

-- 3) workflow_get_progress — read-only, time-based progress + deadline status.
create or replace function workflow_get_progress(p_workflow_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_wf workflow_orders%rowtype;
  v_step workflow_template_steps%rowtype;
  v_weight_sum numeric;
  v_expected_minutes numeric;
  v_elapsed_ratio numeric;
  v_progress int;
  v_deadline_status text;
  v_remaining_seconds numeric;
begin
  select * into v_wf from workflow_orders where id = p_workflow_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Workflow topilmadi');
  end if;

  select * into v_step from workflow_template_steps
    where template_id = v_wf.template_id and status = v_wf.current_status;

  if v_wf.current_status = 'COMPLETED' then
    v_progress := 100;
  elsif v_step.min_progress = v_step.max_progress then
    v_progress := v_step.min_progress;
  elsif v_wf.current_status = 'PRODUCTION'
        and (v_wf.production_manual_progress is not null
             or (v_wf.production_completed_steps is not null and v_wf.production_total_steps is not null)) then
    v_progress := greatest(v_step.min_progress, least(v_step.max_progress, coalesce(
      v_wf.production_manual_progress,
      v_step.min_progress + round(
        (v_wf.production_completed_steps::numeric / nullif(v_wf.production_total_steps, 0))
        * (v_step.max_progress - v_step.min_progress)
      )::int
    )));
  else
    select sum(duration_weight) into v_weight_sum from workflow_template_steps where template_id = v_wf.template_id;
    v_expected_minutes := v_wf.total_promised_minutes * (v_step.duration_weight / nullif(v_weight_sum, 0));
    v_elapsed_ratio := greatest(0, least(1,
      extract(epoch from (now() - v_wf.status_started_at)) / 60 / nullif(v_expected_minutes, 0)
    ));
    v_progress := v_step.min_progress + round(v_elapsed_ratio * (v_step.max_progress - v_step.min_progress))::int;
  end if;

  v_remaining_seconds := extract(epoch from (v_wf.promised_at - now()));
  if now() > v_wf.promised_at then
    v_deadline_status := 'overdue';
  elsif now() > (v_wf.promised_at - make_interval(mins => round(v_wf.total_promised_minutes * 0.15)::int)) then
    v_deadline_status := 'at_risk';
  else
    v_deadline_status := 'on_time';
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_wf.current_status,
    'progress', v_progress,
    'deadline_status', v_deadline_status,
    'promised_at', v_wf.promised_at,
    'remaining_seconds', v_remaining_seconds,
    'status_started_at', v_wf.status_started_at
  );
end;
$$;
revoke execute on function workflow_get_progress(uuid) from public;
revoke execute on function workflow_get_progress(uuid) from anon;
grant execute on function workflow_get_progress(uuid) to authenticated;

-- 4) workflow_get_public_progress — same computation, public_token lookup.
-- Still authenticated-only (NOT anon) — the actual public HTTP endpoint is
-- served by CRM's Next.js API using its own server-side Supabase client,
-- never a raw anon call into Postgres (see WORKFLOW_ENGINE.md §5/§7).
create or replace function workflow_get_public_progress(p_public_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_wf_id uuid;
begin
  select id into v_wf_id from workflow_orders where public_token = p_public_token;
  if v_wf_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Topilmadi');
  end if;
  return workflow_get_progress(v_wf_id);
end;
$$;
revoke execute on function workflow_get_public_progress(uuid) from public;
revoke execute on function workflow_get_public_progress(uuid) from anon;
grant execute on function workflow_get_public_progress(uuid) to authenticated;

-- 5) workflow_update_production_progress — PRODUCTION-only manual/checklist hook.
create or replace function workflow_update_production_progress(
  p_workflow_order_id  uuid,
  p_manual_progress    int default null,
  p_completed_steps    int default null,
  p_total_steps        int default null,
  p_source_system      text default 'erp',
  p_actor_reference    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wf workflow_orders%rowtype;
begin
  select * into v_wf from workflow_orders where id = p_workflow_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Workflow topilmadi');
  end if;

  if v_wf.current_status <> 'PRODUCTION' then
    return jsonb_build_object('ok', false, 'reason', 'not_in_production',
      'message', 'Workflow PRODUCTION holatida emas');
  end if;

  if p_manual_progress is not null and (p_manual_progress < 0 or p_manual_progress > 100) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_progress', 'message', 'progress 0-100 oralig''ida bo''lishi kerak');
  end if;

  update workflow_orders set
    production_manual_progress = p_manual_progress,
    production_completed_steps = p_completed_steps,
    production_total_steps = p_total_steps,
    updated_at = now()
  where id = p_workflow_order_id;

  insert into workflow_status_history (workflow_order_id, from_status, to_status, progress_before, progress_after, changed_by, source_system, actor_reference, note)
  values (v_wf.id, v_wf.current_status, v_wf.current_status, v_wf.current_progress, null, auth.uid(), p_source_system, p_actor_reference, 'production_progress_update');

  return workflow_get_progress(p_workflow_order_id);
end;
$$;
revoke execute on function workflow_update_production_progress(uuid, int, int, int, text, text) from public;
revoke execute on function workflow_update_production_progress(uuid, int, int, int, text, text) from anon;
grant execute on function workflow_update_production_progress(uuid, int, int, int, text, text) to authenticated;

-- 6) workflow_get_timeline — full ordered history for one order.
create or replace function workflow_get_timeline(p_workflow_order_id uuid)
returns setof workflow_status_history
language sql
security definer
set search_path = public
stable
as $$
  select * from workflow_status_history
  where workflow_order_id = p_workflow_order_id
  order by created_at asc;
$$;
revoke execute on function workflow_get_timeline(uuid) from public;
revoke execute on function workflow_get_timeline(uuid) from anon;
grant execute on function workflow_get_timeline(uuid) to authenticated;

-- No seed data — templates/steps are intentionally left empty. Seeding the
-- 'default' template + its 9 steps is a separate, explicit step (Phase 4
-- in CONSOLIDATION_PLAN.md), not part of this schema-only migration.
