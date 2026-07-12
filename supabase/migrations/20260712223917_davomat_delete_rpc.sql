-- ═══════════════════════════════════════
-- DAVOMAT MODULI — 4-bosqich: attendance_delete RPC
--
-- Faqat shu RPC uchun zarur bo'lgan minimal schema moslashtirishlari:
-- 1) davomat_audit_log.action CHECK'ga 'delete' qiymati qo'shiladi.
-- 2) davomat_audit_log.davomat_id NULL bo'lishiga ruxsat beriladi va
--    FK "ON DELETE SET NULL" qilib o'zgartiriladi — shunda davomat
--    qatori o'chirilgandan keyin ham audit yozuvi (va undagi
--    old_values jsonb'dagi to'liq eski holat) saqlanib qoladi,
--    faqat bog'lanish uziladi. Boshqa hech qanday jadval/ustun
--    o'zgartirilmaydi.
-- ═══════════════════════════════════════

alter table davomat_audit_log drop constraint davomat_audit_log_action_check;
alter table davomat_audit_log add constraint davomat_audit_log_action_check
  check (action in ('approve', 'reject', 'manual_edit', 'delete'));

alter table davomat_audit_log alter column davomat_id drop not null;
alter table davomat_audit_log drop constraint davomat_audit_log_davomat_id_fkey;
alter table davomat_audit_log add constraint davomat_audit_log_davomat_id_fkey
  foreign key (davomat_id) references davomat(id) on delete set null;

-- attendance_delete har chaqirilganda "delete from attendance_events where
-- davomat_id = ..." bajaradi — bu ustunga hozircha indeks yo'q edi (FK
-- ustunlar Postgres'da avtomatik indekslanmaydi), shuning uchun shu RPC
-- samaradorligi uchun qo'shiladi
create index if not exists idx_attendance_events_davomat_id on attendance_events(davomat_id);

-- ═══════════════════════════════════════
-- attendance_delete — owner/attendance_manager uchun, davomat qatorini
-- butunlay o'chiradi. Bog'liq attendance_events yozuvlari ham o'chiriladi.
-- Audit log YOZILGANDAN KEYIN o'chirish sodir bo'ladi (eski holat
-- to'liq saqlanadi).
-- ═══════════════════════════════════════
create or replace function public.attendance_delete(p_davomat_id uuid, p_sabab text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old davomat%rowtype;
begin
  if auth.uid() is null then
    raise exception 'attendance_delete: login talab qilinadi' using errcode = '28000';
  end if;

  if not public.is_attendance_staff() then
    raise exception 'attendance_delete: ruxsat yo''q' using errcode = '42501';
  end if;

  if p_sabab is null or length(trim(p_sabab)) = 0 then
    raise exception 'attendance_delete: sabab majburiy';
  end if;

  select * into v_old from davomat where id = p_davomat_id;
  if not found then
    raise exception 'attendance_delete: davomat yozuvi topilmadi';
  end if;

  -- Audit log — o'chirishdan OLDIN, hali qator mavjud paytda (to'liq eski holat bilan)
  insert into davomat_audit_log (davomat_id, changed_by, action, old_values, new_values, sabab)
  values (p_davomat_id, auth.uid(), 'delete', to_jsonb(v_old), null, p_sabab);

  -- Bog'liq skan hodisalari ham o'chiriladi
  delete from attendance_events where davomat_id = p_davomat_id;

  -- Davomat qatori o'chiriladi — audit_log.davomat_id endi "ON DELETE SET NULL"
  -- orqali xavfsiz, FK xatosi bermaydi
  delete from davomat where id = p_davomat_id;

  return jsonb_build_object('ok', true, 'davomat_id', p_davomat_id);
end;
$$;

revoke execute on function public.attendance_delete(uuid, text) from public;
grant execute on function public.attendance_delete(uuid, text) to authenticated;
