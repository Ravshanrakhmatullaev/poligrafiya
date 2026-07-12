-- ═══════════════════════════════════════
-- DAVOMAT MODULI — 3-bosqich: RPC funksiyalari
--
-- Barchasi SECURITY DEFINER — jadval egasi (postgres) nomidan ishlaydi,
-- shu sababli RLS'ni chetlab o'tib davomat/attendance_events/
-- davomat_audit_log jadvallariga yoza oladi. Chaqiruvchi identifikatsiyasi
-- har doim auth.uid() orqali olinadi (frontend hech qanday user_id
-- yubormaydi va yuborsa ham e'tiborga olinmaydi).
--
-- MUHIM TAXMIN (tasdiqlanmagan, standart qiymat sifatida qo'yildi):
-- "Ambiguous" (noaniq) holat chegarasi hali aniq kelishilmagan edi.
-- Shu funksiyada standart qoida: agar kunning birinchi skani
-- branch.work_end'dan 2 soatdan kamroq vaqt qolganda sodir bo'lsa
-- (masalan work_end=18:00 bo'lsa, 16:00dan keyin), tizim buni
-- avtomatik CHECK-IN deb yozmaydi va "Ishga keldim/Ishdan ketyapman"
-- tanlovini talab qiladi. Bu qiymatni keyin osongina o'zgartirish
-- mumkin (pastda AMBIGUOUS_WINDOW konstantasi sifatida ajratilgan).
-- ═══════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── YORDAMCHI: token hash ──
create or replace function public._attendance_token_hash(p_token uuid)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(p_token::text, 'sha256'), 'hex');
$$;

-- ═══════════════════════════════════════
-- 1) attendance_scan — QR skanerlanganda chaqiriladi
-- ═══════════════════════════════════════
create or replace function public.attendance_scan(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_hash         text := public._attendance_token_hash(p_token);
  v_branch       branches%rowtype;
  v_today        date;
  v_now          timestamptz := now();
  v_local_now    time;
  v_row          davomat%rowtype;
  v_work_start_ts timestamptz;
  v_work_end_ts   timestamptz;
  v_ambiguous_from time;
  v_late_minutes integer;
  v_worked_minutes integer;
  v_early_minutes integer;
  v_overtime_minutes integer;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'attendance_scan: login talab qilinadi' using errcode = '28000';
  end if;

  v_today := (v_now at time zone 'Asia/Tashkent')::date;
  v_local_now := (v_now at time zone 'Asia/Tashkent')::time;

  select * into v_branch from branches where qr_secret_hash = v_hash;

  if not found then
    insert into attendance_events (user_id, branch_id, event_type, token_hash, result)
    values (v_user_id, null, 'rejected_invalid_qr', v_hash, 'invalid_qr');
    return jsonb_build_object('ok', false, 'reason', 'invalid_qr',
      'message', 'QR kod yaroqsiz');
  end if;

  if not v_branch.is_active then
    insert into attendance_events (user_id, branch_id, event_type, token_hash, result)
    values (v_user_id, v_branch.id, 'rejected_branch_inactive', v_hash, 'branch_inactive');
    return jsonb_build_object('ok', false, 'reason', 'branch_inactive',
      'message', 'Filial faol emas');
  end if;

  v_work_start_ts := (v_today + v_branch.work_start) at time zone 'Asia/Tashkent';
  v_work_end_ts   := (v_today + v_branch.work_end) at time zone 'Asia/Tashkent';
  v_ambiguous_from := v_branch.work_end - interval '2 hours';  -- taxmin, yuqoridagi izohga qarang

  select * into v_row from davomat where user_id = v_user_id and sana = v_today;

  -- Holat C: ikkalasi ham bor
  if found and v_row.check_in is not null and v_row.check_out is not null then
    insert into attendance_events (user_id, branch_id, davomat_id, event_type, token_hash, result)
    values (v_user_id, v_branch.id, v_row.id, 'rejected_already_completed', v_hash, 'already_completed');
    return jsonb_build_object('ok', false, 'reason', 'already_completed',
      'message', 'Bugungi davomat allaqachon yakunlangan');
  end if;

  -- Holat B: check-in bor, check-out yo'q → CHECK-OUT
  if found and v_row.check_in is not null and v_row.check_out is null then
    v_worked_minutes := round(extract(epoch from (v_now - v_row.check_in)) / 60)::int;
    if v_now < v_work_end_ts then
      v_early_minutes := round(extract(epoch from (v_work_end_ts - v_now)) / 60)::int;
      v_overtime_minutes := 0;
    else
      v_early_minutes := 0;
      v_overtime_minutes := round(extract(epoch from (v_now - v_work_end_ts)) / 60)::int;
    end if;

    update davomat set
      check_out = v_now,
      worked_minutes = v_worked_minutes,
      early_leave_minutes = v_early_minutes,
      overtime_minutes = v_overtime_minutes,
      status = 'checked_out',
      updated_at = v_now
    where id = v_row.id
    returning * into v_row;

    insert into attendance_events (user_id, branch_id, davomat_id, event_type, token_hash, result)
    values (v_user_id, v_branch.id, v_row.id, 'check_out', v_hash, 'checked_out');

    return jsonb_build_object('ok', true, 'action', 'check_out', 'davomat_id', v_row.id,
      'status', v_row.status, 'worked_minutes', v_row.worked_minutes);
  end if;

  -- Holat A: bugungi yozuv yo'q
  if v_local_now >= v_ambiguous_from then
    -- Noaniq holat — yozib qo'yilmaydi, frontend tanlov so'rashi kerak
    return jsonb_build_object('ok', true, 'action', 'ambiguous_choice_required',
      'branch_id', v_branch.id, 'token', p_token);
  end if;

  v_late_minutes := greatest(0, round(extract(epoch from (v_now - v_work_start_ts)) / 60)::int);
  v_status := case when v_late_minutes > 0 then 'late' else 'on_time' end;

  insert into davomat (user_id, branch_id, sana, check_in, late_minutes, status)
  values (v_user_id, v_branch.id, v_today, v_now, v_late_minutes, v_status)
  returning * into v_row;

  insert into attendance_events (user_id, branch_id, davomat_id, event_type, token_hash, result)
  values (v_user_id, v_branch.id, v_row.id, 'check_in', v_hash, v_status);

  return jsonb_build_object('ok', true, 'action', 'check_in', 'davomat_id', v_row.id,
    'status', v_row.status, 'late_minutes', v_row.late_minutes);
end;
$$;

grant execute on function public.attendance_scan(uuid) to authenticated;

-- ═══════════════════════════════════════
-- 2) attendance_resolve — "Ishga keldim" / "Ishdan ketyapman" tanlovidan keyin
-- ═══════════════════════════════════════
create or replace function public.attendance_resolve(
  p_token uuid,
  p_choice text,                 -- 'came_in' | 'leaving'
  p_sabab text default null,     -- p_choice='leaving' bo'lsa majburiy
  p_sabab_matni text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_hash     text := public._attendance_token_hash(p_token);
  v_branch   branches%rowtype;
  v_today    date;
  v_now      timestamptz := now();
  v_existing davomat%rowtype;
  v_row      davomat%rowtype;
  v_late_minutes integer;
begin
  if v_user_id is null then
    raise exception 'attendance_resolve: login talab qilinadi' using errcode = '28000';
  end if;

  if p_choice not in ('came_in', 'leaving') then
    raise exception 'attendance_resolve: noto''g''ri tanlov: %', p_choice;
  end if;

  if p_choice = 'leaving' and (p_sabab is null or length(trim(p_sabab)) = 0) then
    raise exception 'attendance_resolve: "Ishdan ketyapman" uchun sabab majburiy';
  end if;

  v_today := (v_now at time zone 'Asia/Tashkent')::date;

  select * into v_branch from branches where qr_secret_hash = v_hash and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'QR kod yaroqsiz');
  end if;

  -- Race-holat himoyasi: shu oraliqda boshqa so'rov yozib ulgurmaganini tekshirish
  select * into v_existing from davomat where user_id = v_user_id and sana = v_today;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already_exists',
      'message', 'Bugungi davomat yozuvi allaqachon mavjud');
  end if;

  if p_choice = 'came_in' then
    v_late_minutes := greatest(0, round(extract(epoch from (v_now - ((v_today + v_branch.work_start) at time zone 'Asia/Tashkent'))) / 60)::int);

    insert into davomat (user_id, branch_id, sana, check_in, late_minutes, status)
    values (v_user_id, v_branch.id, v_today, v_now, v_late_minutes, 'late')
    returning * into v_row;

    insert into attendance_events (user_id, branch_id, davomat_id, event_type, token_hash, result)
    values (v_user_id, v_branch.id, v_row.id, 'check_in', v_hash, 'late');

    return jsonb_build_object('ok', true, 'action', 'check_in', 'davomat_id', v_row.id,
      'status', v_row.status, 'late_minutes', v_row.late_minutes);
  else
    insert into davomat (
      user_id, branch_id, sana, check_in, check_out, status, sabab, sabab_matni
    )
    values (
      v_user_id, v_branch.id, v_today, null, v_now, 'missing_check_in', p_sabab, p_sabab_matni
    )
    returning * into v_row;

    insert into attendance_events (user_id, branch_id, davomat_id, event_type, token_hash, result, note)
    values (v_user_id, v_branch.id, v_row.id, 'check_out', v_hash, 'missing_check_in', p_sabab_matni);

    return jsonb_build_object('ok', true, 'action', 'check_out', 'davomat_id', v_row.id,
      'status', v_row.status);
  end if;
end;
$$;

grant execute on function public.attendance_resolve(uuid, text, text, text) to authenticated;

-- ═══════════════════════════════════════
-- 3) attendance_approve — owner/attendance_manager tasdiqlaydi
-- ═══════════════════════════════════════
create or replace function public.attendance_approve(p_davomat_id uuid, p_sabab text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old davomat%rowtype;
  v_new davomat%rowtype;
  v_branch branches%rowtype;
  v_worked integer;
  v_early integer;
  v_overtime integer;
begin
  if not public.is_attendance_staff() then
    raise exception 'attendance_approve: ruxsat yo''q' using errcode = '42501';
  end if;

  if p_sabab is null or length(trim(p_sabab)) = 0 then
    raise exception 'attendance_approve: sabab majburiy';
  end if;

  select * into v_old from davomat where id = p_davomat_id;
  if not found then
    raise exception 'attendance_approve: davomat yozuvi topilmadi';
  end if;

  select * into v_branch from branches where id = v_old.branch_id;

  if v_old.check_in is not null and v_old.check_out is not null then
    v_worked := round(extract(epoch from (v_old.check_out - v_old.check_in)) / 60)::int;
    if v_old.check_out < ((v_old.sana + v_branch.work_end) at time zone 'Asia/Tashkent') then
      v_early := round(extract(epoch from (((v_old.sana + v_branch.work_end) at time zone 'Asia/Tashkent') - v_old.check_out)) / 60)::int;
      v_overtime := 0;
    else
      v_early := 0;
      v_overtime := round(extract(epoch from (v_old.check_out - ((v_old.sana + v_branch.work_end) at time zone 'Asia/Tashkent'))) / 60)::int;
    end if;
  else
    -- check_in yoki check_out hali yo'q — ishlagan vaqt hisoblanmaydi
    -- (owner/manager avval attendance_manual_edit orqali to'ldirishi kerak)
    v_worked := null;
    v_early := null;
    v_overtime := null;
  end if;

  update davomat set
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    worked_minutes = v_worked,
    early_leave_minutes = v_early,
    overtime_minutes = v_overtime,
    updated_at = now()
  where id = p_davomat_id
  returning * into v_new;

  insert into davomat_audit_log (davomat_id, changed_by, action, old_values, new_values, sabab)
  values (p_davomat_id, auth.uid(), 'approve', to_jsonb(v_old), to_jsonb(v_new), p_sabab);

  return jsonb_build_object('ok', true, 'davomat_id', v_new.id, 'status', v_new.status,
    'worked_minutes', v_new.worked_minutes);
end;
$$;

grant execute on function public.attendance_approve(uuid, text) to authenticated;

-- ═══════════════════════════════════════
-- 4) attendance_reject — owner/attendance_manager rad etadi
-- ═══════════════════════════════════════
create or replace function public.attendance_reject(p_davomat_id uuid, p_sabab text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old davomat%rowtype;
  v_new davomat%rowtype;
begin
  if not public.is_attendance_staff() then
    raise exception 'attendance_reject: ruxsat yo''q' using errcode = '42501';
  end if;

  if p_sabab is null or length(trim(p_sabab)) = 0 then
    raise exception 'attendance_reject: sabab majburiy';
  end if;

  select * into v_old from davomat where id = p_davomat_id;
  if not found then
    raise exception 'attendance_reject: davomat yozuvi topilmadi';
  end if;

  update davomat set
    status = 'rejected',
    approved_by = auth.uid(),
    approved_at = now(),
    worked_minutes = null,
    early_leave_minutes = null,
    overtime_minutes = null,
    updated_at = now()
  where id = p_davomat_id
  returning * into v_new;

  insert into davomat_audit_log (davomat_id, changed_by, action, old_values, new_values, sabab)
  values (p_davomat_id, auth.uid(), 'reject', to_jsonb(v_old), to_jsonb(v_new), p_sabab);

  return jsonb_build_object('ok', true, 'davomat_id', v_new.id, 'status', v_new.status);
end;
$$;

grant execute on function public.attendance_reject(uuid, text) to authenticated;

-- ═══════════════════════════════════════
-- 5) attendance_manual_edit — owner/attendance_manager qo'lda vaqt kiritadi
-- ═══════════════════════════════════════
create or replace function public.attendance_manual_edit(
  p_davomat_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_sabab text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old davomat%rowtype;
  v_new davomat%rowtype;
  v_branch branches%rowtype;
  v_late integer;
  v_worked integer;
  v_early integer;
  v_overtime integer;
  v_status text;
begin
  if not public.is_attendance_staff() then
    raise exception 'attendance_manual_edit: ruxsat yo''q' using errcode = '42501';
  end if;

  if p_sabab is null or length(trim(p_sabab)) = 0 then
    raise exception 'attendance_manual_edit: sabab majburiy';
  end if;

  select * into v_old from davomat where id = p_davomat_id;
  if not found then
    raise exception 'attendance_manual_edit: davomat yozuvi topilmadi';
  end if;

  select * into v_branch from branches where id = v_old.branch_id;

  if p_check_in is not null then
    v_late := greatest(0, round(extract(epoch from (p_check_in - ((v_old.sana + v_branch.work_start) at time zone 'Asia/Tashkent'))) / 60)::int);
  else
    v_late := null;
  end if;

  if p_check_in is not null and p_check_out is not null then
    v_worked := round(extract(epoch from (p_check_out - p_check_in)) / 60)::int;
    if p_check_out < ((v_old.sana + v_branch.work_end) at time zone 'Asia/Tashkent') then
      v_early := round(extract(epoch from (((v_old.sana + v_branch.work_end) at time zone 'Asia/Tashkent') - p_check_out)) / 60)::int;
      v_overtime := 0;
    else
      v_early := 0;
      v_overtime := round(extract(epoch from (p_check_out - ((v_old.sana + v_branch.work_end) at time zone 'Asia/Tashkent'))) / 60)::int;
    end if;
    v_status := 'approved';
  else
    v_worked := null;
    v_early := null;
    v_overtime := null;
    v_status := coalesce(v_old.status, 'pending_approval');
  end if;

  update davomat set
    check_in = p_check_in,
    check_out = p_check_out,
    late_minutes = v_late,
    worked_minutes = v_worked,
    early_leave_minutes = v_early,
    overtime_minutes = v_overtime,
    status = v_status,
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = p_davomat_id
  returning * into v_new;

  insert into davomat_audit_log (davomat_id, changed_by, action, old_values, new_values, sabab)
  values (p_davomat_id, auth.uid(), 'manual_edit', to_jsonb(v_old), to_jsonb(v_new), p_sabab);

  return jsonb_build_object('ok', true, 'davomat_id', v_new.id, 'status', v_new.status,
    'worked_minutes', v_new.worked_minutes);
end;
$$;

grant execute on function public.attendance_manual_edit(uuid, timestamptz, timestamptz, text) to authenticated;
