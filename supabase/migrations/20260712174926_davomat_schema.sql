-- ═══════════════════════════════════════
-- DAVOMAT MODULI — 1-bosqich: jadvallar
-- Tasdiqlangan sxema (chat orqali kelishilgan, o'zgarmaydi)
-- ═══════════════════════════════════════

-- 1) FILIALLAR
create table branches (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,              -- "Ishlab chiqarish", "Sotuv"
  code               text unique not null,        -- 'production', 'sales'
  qr_secret_hash     text not null unique,           -- QR'dagi random UUID'ning sha256 hash'i (raw UUID DB'da saqlanmaydi); unique = lookup indeksi ham beradi
  allowed_public_ip  inet,                          -- V2 uchun tayyorgarlik — hozircha hech qanday RPC bu ustunni tekshirmaydi
  work_start         time not null default '09:30',
  work_end           time not null default '18:00',
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

-- 2) ROLLAR — backendda haqiqiy tekshirish uchun (frontenddagi ROLES obyektidan mustaqil)
create table user_roles (
  user_id     uuid primary key references auth.users(id),
  role        text not null check (role in
                ('owner','admin','ishlab','dizayner','uvdtf','attendance_manager')),
  updated_at  timestamptz not null default now()
);

-- 3) KUNLIK DAVOMAT YOZUVI
create table davomat (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id),
  branch_id            uuid not null references branches(id),
  sana                 date not null,
  check_in             timestamptz,
  check_out            timestamptz,
  late_minutes         integer,
  worked_minutes       integer,
  early_leave_minutes  integer,
  overtime_minutes     integer,
  status               text not null default 'pending' check (status in (
                          'on_time','late','checked_out','missing_check_in',
                          'missing_check_out','absent','day_off',
                          'pending_approval','approved','rejected'
                        )),
  sabab                text,
  sabab_matni          text,
  approved_by          uuid references auth.users(id),
  approved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, sana)
);

-- 4) HAR BIR SKAN URINISHI — audit/forensika (muvaffaqiyatli va rad etilganlar ham)
create table attendance_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id),
  branch_id    uuid references branches(id),          -- QR yaroqsiz bo'lsa null
  davomat_id   uuid references davomat(id),            -- muvaffaqiyatli bo'lsa bog'lanadi
  event_type   text not null check (event_type in (
                  'check_in','check_out',
                  'rejected_invalid_qr',
                  'rejected_branch_inactive',
                  'rejected_already_completed'
                )),
  token_hash   text,
  result       text,
  note         text,
  created_at   timestamptz not null default now()
);

-- 5) TASDIQLASH / QO'LDA TAHRIR — AUDIT LOG
create table davomat_audit_log (
  id           uuid primary key default gen_random_uuid(),
  davomat_id   uuid not null references davomat(id),
  changed_by   uuid not null references auth.users(id),
  action       text not null check (action in ('approve','reject','manual_edit')),
  old_values   jsonb,
  new_values   jsonb,
  sabab        text not null,
  created_at   timestamptz not null default now()
);

-- idx_davomat_user_sana qo'shilmadi — unique(user_id, sana) constraint buni avtomatik ta'minlaydi
create index idx_davomat_branch    on davomat(branch_id);
create index idx_davomat_sana      on davomat(sana);
create index idx_davomat_pending   on davomat(status)
  where status in ('missing_check_in', 'missing_check_out', 'pending_approval');
create index idx_events_user       on attendance_events(user_id, created_at);
