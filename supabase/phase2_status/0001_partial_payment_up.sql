-- ============================================================================
-- PHASE 2 — Partial payment + brak status (ADDITIVE, REVIEW ONLY)
-- Project: poligrafiya ERP (Supabase jxxmbgmbaqausqunfyna), table public.zakazlar
-- DO NOT apply automatically — intentionally OUTSIDE supabase/migrations/ so
-- `supabase db push` cannot sweep it up. Fully reversible: *_down.sql.
--
-- Why: the ERP order status is currently only is_paid (boolean). "Qisman
-- to'landi" (partial) cannot be represented, and is_brak is referenced in code
-- but the COLUMN DOES NOT EXIST on zakazlar (so brak filters silently no-op).
-- These two additive columns close both gaps WITHOUT changing any existing row
-- behaviour (defaults keep every current order exactly as it is today).
--
-- Status derivation once applied (client orderStatusKey, utils.js):
--   is_brak = true                              -> Brak
--   0 < paid_amount < order total               -> Qisman to'landi
--   is_paid = true (or paid_amount >= total)    -> To'liq to'landi
--   otherwise                                   -> To'lov kutilmoqda
-- ============================================================================

begin;

-- Partial-payment amount. NULL/0 = no partial info -> current behaviour intact.
alter table public.zakazlar
  add column if not exists paid_amount numeric(14,2) not null default 0
  check (paid_amount >= 0);

-- Real brak flag (code already reads h.is_brak; the column was missing).
alter table public.zakazlar
  add column if not exists is_brak boolean not null default false;

-- Optional helper index for status filtering (cheap, additive).
create index if not exists zakazlar_status_idx on public.zakazlar (is_paid, is_brak);

commit;
