-- ════════════════════════════════════════════════════════════════════════
-- 0003 — PRODUCTION SEED: UUID-keyed business config for erp_employee_profile
-- ════════════════════════════════════════════════════════════════════════
-- Applies the real employee business configuration (display name, KPI tier /
-- target / fiks, bonus_50 eligibility) keyed by production Auth UUID.
--
-- CONTAINS: UUID + display_name + KPI + bonus ONLY. No emails. No secrets.
-- RUNS: in a single transaction (BEGIN/COMMIT) — all-or-nothing.
-- GUARD: verifies every seeded UUID already exists in auth.users and ABORTS the
--        whole transaction if any is absent (no partial seed, no orphan config).
-- UPSERT: on conflict DO UPDATE → a re-run reconciles to THIS intended config
--         and can never silently preserve a stale/wrong KPI/display value.
-- VALIDATE: after the UPSERT, asserts the seeded set lands exactly (16 rows,
--        2 bonus-eligible, no null/empty names) or raises and rolls back.
--
-- Prerequisite: 0002_erp_employee_profile_up.sql applied. Apply AFTER temporary
-- runtime validation passes. Rollback: 0003_erp_employee_seed_down.sql
-- NOTE: the validation runner does NOT run this file — it seeds its own
-- disposable temp users instead, so production UUIDs never touch a temp project.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- Staging table (dropped at COMMIT) holding the intended config.
create temp table _erp_seed (
  user_id           uuid,
  display_name      text,
  kpi_daraja        text,
  kpi_maqsad        bigint,
  kpi_fiks          bigint,
  bonus_50_eligible boolean
) on commit drop;

insert into _erp_seed (user_id, display_name, kpi_daraja, kpi_maqsad, kpi_fiks, bonus_50_eligible) values
  ('2a4548d6-8f63-4473-acce-b6b49710ff8f','Ravshan (Owner)',           null, null, null, false),
  ('4322b1ec-8266-47f0-8e10-15177750b12b','Bayramali',                 null, null, null, false),
  ('d7ebd326-e725-49d4-ba21-75b42725f17b','Umar',                      null, null, null, false),
  ('36724f68-e282-498f-a49f-e92a25ab23b8','Parvina',                   null, null, null, false),
  ('f611587a-eee6-43f6-b246-a88e8a7de10e','Mohlaroy',           'boshlangich',30000000,1500000,false),
  ('e7ee02e7-0139-462d-8682-f6603d323d1e','Abror',             'professional',60000000,1000000,true),
  ('6451a1db-666c-4194-848d-fb94636693db','Umidjon',            'boshlangich',30000000,1500000,false),
  ('b81c0acd-6d7d-4866-8461-394591950bfe','Ulugbek',            'boshlangich',30000000,1500000,false),
  ('5d170c9b-b524-45a9-bab1-8a6a7f62f903','Zuhriddin',                 null, null, null, false),
  ('5dab55ac-af76-452d-8bb2-7b10593bc952','Ulugbek (Ishlab chiqarish)',null, null, null, false),
  ('916e5a5b-431e-48dc-9a7c-ba7bc9d45740','Rashidulloh',           'tajriba',45000000,1800000,true),
  ('9d23bc5f-1489-4400-b35f-899b99f0f3d2','Ulugbek (Dizayner)',        null, null, null, false),
  ('9333ea8d-06c4-44c4-8e92-54d9f915b250','Begzodbek',                 null, null, null, false),
  ('e3e134df-7d35-4b63-8fb7-6fef9a9598ac','Gaybulloh',                 null, null, null, false),
  ('940769f7-89d5-4a95-a067-fd3a44e8200b','Oybek',                     null, null, null, false),
  ('a8b50ac0-79f9-4af5-8598-ef84f026fe7a','UV DTF Sherik',             null, null, null, false);

-- GUARD: every seeded UUID must already exist in auth.users, else abort atomically.
do $$
declare missing int;
begin
  select count(*) into missing
  from _erp_seed s
  left join auth.users u on u.id = s.user_id
  where u.id is null;
  if missing > 0 then
    raise exception 'SEED ABORTED: % expected auth.users UUID(s) absent — provision Auth accounts first', missing;
  end if;
end $$;

-- UPSERT the config (reconcile; never silently stale).
insert into public.erp_employee_profile
  (user_id, display_name, kpi_daraja, kpi_maqsad, kpi_fiks, bonus_50_eligible)
select user_id, display_name, kpi_daraja, kpi_maqsad, kpi_fiks, bonus_50_eligible
from _erp_seed
on conflict (user_id) do update set
  display_name      = excluded.display_name,
  kpi_daraja        = excluded.kpi_daraja,
  kpi_maqsad        = excluded.kpi_maqsad,
  kpi_fiks          = excluded.kpi_fiks,
  bonus_50_eligible = excluded.bonus_50_eligible,
  updated_at        = now();

-- VALIDATE the seeded set landed exactly (counts measured over the seed set only,
-- so pre-existing unrelated rows cannot mask a seed error).
do $$
declare seeded int; bonus int; bad_names int; daraja_bad int;
begin
  select count(*) into seeded
    from public.erp_employee_profile p join _erp_seed s using (user_id);
  select count(*) into bonus
    from public.erp_employee_profile p join _erp_seed s using (user_id)
    where p.bonus_50_eligible;
  select count(*) into bad_names
    from public.erp_employee_profile p join _erp_seed s using (user_id)
    where p.display_name is null or p.display_name = '';
  select count(*) into daraja_bad
    from public.erp_employee_profile p join _erp_seed s using (user_id)
    where p.kpi_daraja is not null and (p.kpi_maqsad is null or p.kpi_fiks is null);
  if seeded <> 16   then raise exception 'SEED VALIDATION: expected 16 rows, got %', seeded; end if;
  if bonus  <> 2    then raise exception 'SEED VALIDATION: expected 2 bonus-eligible, got %', bonus; end if;
  if bad_names > 0  then raise exception 'SEED VALIDATION: % null/empty display_name', bad_names; end if;
  if daraja_bad > 0 then raise exception 'SEED VALIDATION: % KPI rows missing maqsad/fiks', daraja_bad; end if;
end $$;

commit;
