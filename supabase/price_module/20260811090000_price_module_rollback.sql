-- Manual rollback for 20260811090000_price_module.sql.
-- Do not run after real PRICE data is in use without taking a backup first.

begin;

drop function if exists public.pricing_quote(bigint, numeric, numeric, numeric);
drop function if exists public.pricing_set_archived(bigint, boolean);
drop function if exists public.pricing_save_product(jsonb, jsonb);

-- Deliberately no CASCADE: if a later module depends on PRICE, rollback must
-- stop for explicit review instead of deleting unrelated objects.
drop table if exists public.pricing_favorites;
drop table if exists public.pricing_price_history;
drop table if exists public.pricing_price_tiers;
drop table if exists public.pricing_products;

drop function if exists public.pricing_write_history();
drop function if exists public.pricing_reject_tier_range_collision();
drop function if exists public.pricing_touch_updated_at();
drop function if exists public.pricing_is_admin();

commit;
