-- ============================================================================
-- PHASE 2 — Partial payment + brak status  ROLLBACK
-- Removes only what 0001_partial_payment_up.sql added. Touches nothing else.
-- ============================================================================

begin;

drop index if exists public.zakazlar_status_idx;
alter table public.zakazlar drop column if exists paid_amount;
alter table public.zakazlar drop column if exists is_brak;

commit;
