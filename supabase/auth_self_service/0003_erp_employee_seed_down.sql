-- ════════════════════════════════════════════════════════════════════════
-- Rollback of 0003 — removes ONLY the seeded production config rows.
-- Keeps the table/RLS/grants/directory (those belong to 0002). Transactional.
-- Safe: the frontend cutover to this table is gated/not activated.
-- ════════════════════════════════════════════════════════════════════════
begin;
delete from public.erp_employee_profile where user_id in (
  '2a4548d6-8f63-4473-acce-b6b49710ff8f',
  '4322b1ec-8266-47f0-8e10-15177750b12b',
  'd7ebd326-e725-49d4-ba21-75b42725f17b',
  '36724f68-e282-498f-a49f-e92a25ab23b8',
  'f611587a-eee6-43f6-b246-a88e8a7de10e',
  'e7ee02e7-0139-462d-8682-f6603d323d1e',
  '6451a1db-666c-4194-848d-fb94636693db',
  'b81c0acd-6d7d-4866-8461-394591950bfe',
  '5d170c9b-b524-45a9-bab1-8a6a7f62f903',
  '5dab55ac-af76-452d-8bb2-7b10593bc952',
  '916e5a5b-431e-48dc-9a7c-ba7bc9d45740',
  '9d23bc5f-1489-4400-b35f-899b99f0f3d2',
  '9333ea8d-06c4-44c4-8e92-54d9f915b250',
  'e3e134df-7d35-4b63-8fb7-6fef9a9598ac',
  '940769f7-89d5-4a95-a067-fd3a44e8200b',
  'a8b50ac0-79f9-4af5-8598-ef84f026fe7a'
);
commit;
