-- ═══════════════════════════════════════
-- DAVOMAT UX — read-only preview RPC
--
-- Muammo: QR tasdiqlash kartochkasi filial nomi va taxminiy amalni
-- "Tasdiqlash" bosilishidan OLDIN ko'rsatishi kerak, lekin xodim
-- branches jadvalini to'g'ridan-to'g'ri o'qiy olmaydi (RLS) va
-- attendance_scan (yozuvchi RPC) hozircha chaqirilmasligi kerak.
--
-- Yechim: attendance_preview — faqat SELECT qiladigan, hech qanday
-- INSERT/UPDATE/DELETE qilmaydigan RPC. attendance_scan bilan bir xil
-- token-hash orqali filialni topadi va bugungi davomat holatidan
-- taxminiy amalni (check_in/check_out/ambiguous/already_completed)
-- qaytaradi — lekin hech narsa yozmaydi va attendance_events'ga
-- audit yozuvi ham qo'shmaydi (bu shunchaki ko'rish, "urinish" emas).
--
-- Haqiqiy yozish faqat attendance_scan orqali, foydalanuvchi
-- "Tasdiqlash" bosgandan keyin sodir bo'ladi (frontend shunday chaqiradi).
-- ═══════════════════════════════════════

create or replace function public.attendance_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id      uuid := auth.uid();
  v_token_uuid   uuid;
  v_hash         text;
  v_branch       branches%rowtype;
  v_today        date;
  v_now          timestamptz := now();
  v_local_now    time;
  v_row          davomat%rowtype;
  v_ambiguous_from time;
begin
  if v_user_id is null then
    raise exception 'attendance_preview: login talab qilinadi' using errcode = '28000';
  end if;

  begin
    v_token_uuid := p_token::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'QR kod yaroqsiz');
  end;

  v_hash := public._attendance_token_hash(v_token_uuid);

  v_today := (v_now at time zone 'Asia/Tashkent')::date;
  v_local_now := (v_now at time zone 'Asia/Tashkent')::time;

  select * into v_branch from branches where qr_secret_hash = v_hash;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'QR kod yaroqsiz');
  end if;

  if not v_branch.is_active then
    return jsonb_build_object('ok', false, 'reason', 'branch_inactive', 'message', 'Filial faol emas');
  end if;

  select * into v_row from davomat where user_id = v_user_id and sana = v_today;

  if found and v_row.check_out is not null then
    return jsonb_build_object('ok', true, 'action', 'already_completed',
      'branch_name', v_branch.name, 'branch_code', v_branch.code,
      'message', 'Bugungi davomat allaqachon yakunlangan');
  end if;

  if not found then
    v_ambiguous_from := v_branch.work_end - interval '2 hours';  -- attendance_scan bilan bir xil taxmin
    if v_local_now >= v_ambiguous_from then
      return jsonb_build_object('ok', true, 'action', 'ambiguous',
        'branch_name', v_branch.name, 'branch_code', v_branch.code);
    end if;
    return jsonb_build_object('ok', true, 'action', 'check_in',
      'branch_name', v_branch.name, 'branch_code', v_branch.code);
  end if;

  -- check_in bor, check_out yo'q
  return jsonb_build_object('ok', true, 'action', 'check_out',
    'branch_name', v_branch.name, 'branch_code', v_branch.code);
end;
$$;

revoke execute on function public.attendance_preview(text) from public;
revoke execute on function public.attendance_preview(text) from anon;
grant execute on function public.attendance_preview(text) to authenticated;
