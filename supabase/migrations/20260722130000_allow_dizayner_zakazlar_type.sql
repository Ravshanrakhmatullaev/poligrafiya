-- ═══════════════════════════════════════
-- FIX — zakazlar_type_check never allowed 'dizayner'
--
-- Root cause of "designers cannot save their completed work": the CHECK
-- constraint on zakazlar.type only ever allowed ('admin', 'ishlab'). Every
-- application code path that writes a designer's own saved work
-- (js/panels/dizayner.js saveDizayner(), which inserts { type: 'dizayner',
-- ... }) has therefore been rejected by Postgres at INSERT time with
-- error 23514 ("violates check constraint zakazlar_type_check") on every
-- single attempt, for as long as this constraint has existed — confirmed
-- live: zero rows with type='dizayner' exist in production as of this
-- migration (`select type, count(*) from zakazlar group by type` returns
-- only 'admin' and 'ishlab'). This is not a client-side bug (a separate,
-- real client-side bug in saveDizayner()'s missing try/catch/finally was
-- also found and fixed in js/panels/dizayner.js — see that commit), and
-- fixing only the client-side bug would still leave every designer save
-- permanently failing at the database layer.
--
-- Fix: add 'dizayner' to the allowed set. 'uvdtf' is deliberately NOT
-- added — that role only ever reads the UV DTF report panel
-- (PROJECT_CONTEXT.md: "uvdtf — restricted single-purpose role, only sees
-- the UV DTF report panel"), it has no save/insert code path anywhere in
-- the app, so adding it here would be speculative, not a fix for anything
-- observed.
--
-- Rollback (manual, if ever needed — trivial, no data touched by this
-- migration itself, only future inserts would be affected):
--   alter table public.zakazlar drop constraint zakazlar_type_check;
--   alter table public.zakazlar add constraint zakazlar_type_check
--     check (type = any (array['admin', 'ishlab']));
-- ═══════════════════════════════════════

alter table public.zakazlar drop constraint zakazlar_type_check;
alter table public.zakazlar add constraint zakazlar_type_check
  check (type = any (array['admin', 'ishlab', 'dizayner']));
