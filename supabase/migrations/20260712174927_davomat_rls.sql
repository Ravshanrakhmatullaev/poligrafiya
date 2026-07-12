-- ═══════════════════════════════════════
-- DAVOMAT MODULI — 2-bosqich: RLS policy
--
-- Asosiy qoida: hech qanday client (anon/authenticated) davomat,
-- attendance_events yoki davomat_audit_log jadvallariga to'g'ridan-to'g'ri
-- INSERT/UPDATE/DELETE qila olmaydi. Barcha yozish faqat 3-bosqichdagi
-- SECURITY DEFINER RPC funksiyalari orqali amalga oshadi (ular jadval
-- egasi — postgres — nomidan ishlaydi va shu sababli RLS'ni chetlab
-- o'tadi, chunki jadvallarga FORCE ROW LEVEL SECURITY qo'yilmagan).
-- ═══════════════════════════════════════

-- ── ROL TEKSHIRUV YORDAMCHI FUNKSIYALARI ──
-- user_roles jadvalidan haqiqiy rolni o'qiydi (frontenddagi ROLES obyektiga ishonilmaydi)

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from user_roles where user_id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'owner' from user_roles where user_id = auth.uid()),
    false
  );
$$;

create or replace function public.is_attendance_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'attendance_manager') from user_roles where user_id = auth.uid()),
    false
  );
$$;

-- Minimal privilege: PUBLIC (shu jumladan anon)'dan olib tashlab, faqat authenticated'ga beriladi
revoke execute on function public.current_user_role() from public;
revoke execute on function public.is_owner() from public;
revoke execute on function public.is_attendance_staff() from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_attendance_staff() to authenticated;

-- ── RLS YOQISH ──
alter table branches           enable row level security;
alter table user_roles         enable row level security;
alter table davomat            enable row level security;
alter table attendance_events  enable row level security;
alter table davomat_audit_log  enable row level security;

-- ── GRANT — faqat SELECT, hech qanday to'g'ridan-to'g'ri yozish yo'q ──
revoke all on branches, user_roles, davomat, attendance_events, davomat_audit_log
  from anon, authenticated;

grant select on branches           to authenticated;
grant select on user_roles         to authenticated;
grant select on davomat            to authenticated;
grant select on attendance_events  to authenticated;
grant select on davomat_audit_log  to authenticated;

-- ── BRANCHES ──
-- Oddiy xodimga kerak emas (QR skan RPC ichida ishlaydi, RLS'ni chetlab o'tadi)
create policy branches_select_staff on branches
  for select
  using (is_attendance_staff());

create policy branches_insert_owner on branches
  for insert
  with check (is_owner());

create policy branches_update_owner on branches
  for update
  using (is_owner())
  with check (is_owner());

create policy branches_delete_owner on branches
  for delete
  using (is_owner());

-- ── USER_ROLES ──
create policy user_roles_select_self_or_owner on user_roles
  for select
  using (user_id = auth.uid() or is_owner());

create policy user_roles_insert_owner on user_roles
  for insert
  with check (is_owner());

create policy user_roles_update_owner on user_roles
  for update
  using (is_owner())
  with check (is_owner());

create policy user_roles_delete_owner on user_roles
  for delete
  using (is_owner());

-- ── DAVOMAT ──
-- SELECT: xodim faqat o'zinikini, owner/attendance_manager hammasini
-- INSERT/UPDATE/DELETE uchun policy yo'q — faqat RPC (security definer) orqali
create policy davomat_select_self_or_staff on davomat
  for select
  using (user_id = auth.uid() or is_attendance_staff());

-- ── ATTENDANCE_EVENTS ──
-- Faqat owner/attendance_manager ko'radi (audit/forensika ma'lumoti)
create policy attendance_events_select_staff on attendance_events
  for select
  using (is_attendance_staff());

-- ── DAVOMAT_AUDIT_LOG ──
create policy davomat_audit_log_select_staff on davomat_audit_log
  for select
  using (is_attendance_staff());
