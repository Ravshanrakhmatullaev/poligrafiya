-- PRICE module: internal product catalog and canonical pricing source.
-- Additive only. Apply through the normal Supabase migration workflow.

begin;

create or replace function public.pricing_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  -- ERP auth source of truth: crm_profiles.role. The existing frontend maps
  -- director -> owner and manager -> admin. user_roles belongs to Davomat.
  select exists (
    select 1
    from public.crm_profiles
    where id = auth.uid() and role in ('director', 'manager')
  );
$$;

revoke all on function public.pricing_is_admin() from public;
grant execute on function public.pricing_is_admin() to authenticated;

create table public.pricing_products (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 2 and 160),
  category text not null check (length(trim(category)) between 2 and 80),
  tags text[] not null default '{}',
  aliases text[] not null default '{}',
  description text,
  customer_note text,
  unit text not null default 'dona'
    check (unit in ('dona', 'm2', 'pogon_metr', 'varaq', 'komplekt', 'xizmat')),
  sku text,
  image_url text,
  status text not null default 'active'
    check (status in ('active', 'archived', 'draft')),
  pricing_mode text not null default 'fixed'
    check (pricing_mode in ('fixed', 'quantity_tier', 'area', 'linear_meter', 'calculator', 'manual')),
  currency text not null default 'UZS' check (currency in ('UZS', 'USD')),
  base_price numeric(16,2) not null default 0 check (base_price >= 0),
  min_quantity numeric(14,3) not null default 1 check (min_quantity > 0),
  production_time text,
  pricing_source_key text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_products_source_key_check check (
    pricing_mode <> 'calculator' or nullif(trim(pricing_source_key), '') is not null
  ),
  constraint pricing_products_no_duplicate_calculator_price check (
    pricing_mode not in ('calculator', 'manual', 'quantity_tier') or base_price = 0
  )
);

create unique index pricing_products_sku_uq
  on public.pricing_products (lower(sku)) where sku is not null;
create unique index pricing_products_source_key_uq
  on public.pricing_products (pricing_source_key) where pricing_source_key is not null;
create index pricing_products_catalog_idx
  on public.pricing_products (status, category, updated_at desc);
create index pricing_products_name_idx on public.pricing_products (lower(name));
create index pricing_products_tags_idx on public.pricing_products using gin (tags);
create index pricing_products_aliases_idx on public.pricing_products using gin (aliases);

create table public.pricing_price_tiers (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.pricing_products(id) on delete cascade,
  min_value numeric(14,3) not null check (min_value > 0),
  max_value numeric(14,3) check (max_value is null or max_value >= min_value),
  unit_price numeric(16,2) not null check (unit_price >= 0),
  setup_price numeric(16,2) not null default 0 check (setup_price >= 0),
  label text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pricing_price_tiers_lookup_idx
  on public.pricing_price_tiers (product_id, is_active, min_value, max_value);

create table public.pricing_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.pricing_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index pricing_favorites_product_idx on public.pricing_favorites (product_id);

create table public.pricing_price_history (
  id bigint generated always as identity primary key,
  product_id bigint,
  product_name text not null,
  entity_type text not null check (entity_type in ('product', 'tier', 'tier_set')),
  entity_id bigint not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_name text not null default 'Noma''lum foydalanuvchi',
  changed_at timestamptz not null default now()
);

create index pricing_price_history_product_idx
  on public.pricing_price_history (product_id, changed_at desc);

create or replace function public.pricing_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pricing_products_touch
before update on public.pricing_products
for each row execute function public.pricing_touch_updated_at();

create trigger pricing_price_tiers_touch
before update on public.pricing_price_tiers
for each row execute function public.pricing_touch_updated_at();

create or replace function public.pricing_reject_tier_range_collision()
returns trigger
language plpgsql
as $$
begin
  -- Generic inclusive numeric ranges: one basis must not match two active
  -- tariffs, otherwise quote selection would be ambiguous.
  if new.is_active and exists (
    select 1
    from public.pricing_price_tiers t
    where t.product_id = new.product_id
      and t.id <> coalesce(new.id, 0)
      and t.is_active
      and new.min_value <= coalesce(t.max_value, 999999999999::numeric)
      and coalesce(new.max_value, 999999999999::numeric) >= t.min_value
  ) then
    raise exception 'PRICE tarif oraliqlari bir xil miqdorni qamrab olmasligi kerak'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger pricing_price_tiers_no_range_collision
before insert or update on public.pricing_price_tiers
for each row execute function public.pricing_reject_tier_range_collision();

create or replace function public.pricing_write_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product_id bigint;
  v_product_name text;
  v_changed_by_name text;
begin
  -- updated_at/updated_by are bookkeeping, not a customer-facing price or
  -- product change. Avoid noisy history rows on a semantic no-op save.
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'updated_at' - 'updated_by')
         = (to_jsonb(new) - 'updated_at' - 'updated_by') then
    return new;
  end if;

  if tg_table_name = 'pricing_products' then
    v_product_id := coalesce(new.id, old.id);
    v_product_name := coalesce(new.name, old.name, 'Noma''lum mahsulot');
  else
    v_product_id := coalesce(new.product_id, old.product_id);
    select name into v_product_name from public.pricing_products where id = v_product_id;
    v_product_name := coalesce(v_product_name, 'O''chirilgan mahsulot');
  end if;

  select full_name into v_changed_by_name
  from public.crm_profiles where id = auth.uid();

  insert into public.pricing_price_history (
    product_id, product_name, entity_type, entity_id, action,
    old_data, new_data, changed_by, changed_by_name
  ) values (
    v_product_id,
    v_product_name,
    case when tg_table_name = 'pricing_products' then 'product' else 'tier' end,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid(), coalesce(v_changed_by_name, 'Noma''lum foydalanuvchi')
  );
  return coalesce(new, old);
end;
$$;

create trigger pricing_products_history
after insert or update or delete on public.pricing_products
for each row execute function public.pricing_write_history();

alter table public.pricing_products enable row level security;
alter table public.pricing_price_tiers enable row level security;
alter table public.pricing_favorites enable row level security;
alter table public.pricing_price_history enable row level security;

create policy pricing_products_read on public.pricing_products
for select to authenticated
using (status = 'active' or public.pricing_is_admin());

create policy pricing_products_admin_write on public.pricing_products
for all to authenticated
using (public.pricing_is_admin())
with check (public.pricing_is_admin());

create policy pricing_price_tiers_read on public.pricing_price_tiers
for select to authenticated
using (
  public.pricing_is_admin() or exists (
    select 1 from public.pricing_products p
    where p.id = product_id and p.status = 'active'
  )
);

create policy pricing_price_tiers_admin_write on public.pricing_price_tiers
for all to authenticated
using (public.pricing_is_admin())
with check (public.pricing_is_admin());

create policy pricing_favorites_own_read on public.pricing_favorites
for select to authenticated using (
  user_id = auth.uid() and (
    public.pricing_is_admin() or exists (
      select 1 from public.pricing_products p
      where p.id = product_id and p.status = 'active'
    )
  )
);

create policy pricing_favorites_own_insert on public.pricing_favorites
for insert to authenticated
with check (
  user_id = auth.uid() and exists (
    select 1 from public.pricing_products p
    where p.id = product_id and p.status = 'active'
  )
);

create policy pricing_favorites_own_delete on public.pricing_favorites
for delete to authenticated using (user_id = auth.uid());

create policy pricing_price_history_read on public.pricing_price_history
for select to authenticated
using (
  public.pricing_is_admin() or exists (
    select 1 from public.pricing_products p
    where p.id = product_id and p.status = 'active'
  )
);

create or replace function public.pricing_save_product(
  p_product jsonb,
  p_tiers jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id bigint := nullif(p_product->>'id', '')::bigint;
  v_tier jsonb;
  v_tags text[] := array(select jsonb_array_elements_text(coalesce(p_product->'tags', '[]'::jsonb)));
  v_old_tiers jsonb := '[]'::jsonb;
  v_new_tiers jsonb := '[]'::jsonb;
  v_changed_by_name text;
begin
  if not public.pricing_is_admin() then
    raise exception 'PRICE tahrirlash uchun owner yoki admin roli kerak'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(coalesce(p_tiers, '[]'::jsonb)) <> 'array' then
    raise exception 'PRICE tariflari massiv ko''rinishida bo''lishi kerak';
  end if;
  if coalesce(p_product->>'pricing_mode', 'fixed') in ('calculator', 'manual')
     and jsonb_array_length(coalesce(p_tiers, '[]'::jsonb)) > 0 then
    raise exception 'Calculator/manual mahsulot PRICE tariflarini saqlamasligi kerak';
  end if;
  if coalesce(p_product->>'status', 'active') = 'active'
     and coalesce(p_product->>'pricing_mode', 'fixed') = 'quantity_tier'
     and jsonb_array_length(coalesce(p_tiers, '[]'::jsonb)) = 0 then
    raise exception 'Faol quantity-tier mahsulot uchun kamida bitta tarif kerak';
  end if;
  if coalesce(p_product->>'status', 'active') = 'active'
     and coalesce(p_product->>'pricing_mode', 'fixed') in ('fixed', 'area', 'linear_meter')
     and coalesce(nullif(p_product->>'base_price', '')::numeric, 0) = 0
     and jsonb_array_length(coalesce(p_tiers, '[]'::jsonb)) = 0 then
    raise exception 'Faol mahsulot uchun bazaviy narx yoki tarif kerak';
  end if;

  if v_id is null then
    insert into public.pricing_products (
      name, category, tags, aliases, description, customer_note, unit, sku, image_url,
      status, pricing_mode, currency, base_price, min_quantity,
      production_time, pricing_source_key, created_by, updated_by
    ) values (
      trim(p_product->>'name'), trim(p_product->>'category'), v_tags,
      array(select jsonb_array_elements_text(coalesce(p_product->'aliases', '[]'::jsonb))),
      nullif(trim(p_product->>'description'), ''),
      nullif(trim(p_product->>'customer_note'), ''),
      coalesce(nullif(p_product->>'unit', ''), 'dona'),
      nullif(trim(p_product->>'sku'), ''),
      nullif(trim(p_product->>'image_url'), ''),
      coalesce(nullif(p_product->>'status', ''), 'active'),
      coalesce(nullif(p_product->>'pricing_mode', ''), 'fixed'),
      coalesce(nullif(p_product->>'currency', ''), 'UZS'),
      case when p_product->>'pricing_mode' in ('calculator','manual','quantity_tier') then 0
        else coalesce(nullif(p_product->>'base_price', '')::numeric, 0) end,
      coalesce(nullif(p_product->>'min_quantity', '')::numeric, 1),
      nullif(trim(p_product->>'production_time'), ''),
      case when p_product->>'pricing_mode' = 'calculator'
        then nullif(trim(p_product->>'pricing_source_key'), '') end,
      auth.uid(), auth.uid()
    ) returning id into v_id;
  else
    update public.pricing_products set
      name = trim(p_product->>'name'),
      category = trim(p_product->>'category'),
      tags = v_tags,
      aliases = array(select jsonb_array_elements_text(coalesce(p_product->'aliases', '[]'::jsonb))),
      description = nullif(trim(p_product->>'description'), ''),
      customer_note = nullif(trim(p_product->>'customer_note'), ''),
      unit = coalesce(nullif(p_product->>'unit', ''), 'dona'),
      sku = nullif(trim(p_product->>'sku'), ''),
      image_url = nullif(trim(p_product->>'image_url'), ''),
      status = coalesce(nullif(p_product->>'status', ''), status),
      pricing_mode = coalesce(nullif(p_product->>'pricing_mode', ''), pricing_mode),
      currency = coalesce(nullif(p_product->>'currency', ''), currency),
      base_price = case when p_product->>'pricing_mode' in ('calculator','manual','quantity_tier') then 0
        else coalesce(nullif(p_product->>'base_price', '')::numeric, 0) end,
      min_quantity = coalesce(nullif(p_product->>'min_quantity', '')::numeric, 1),
      production_time = nullif(trim(p_product->>'production_time'), ''),
      pricing_source_key = case when p_product->>'pricing_mode' = 'calculator'
        then nullif(trim(p_product->>'pricing_source_key'), '') end,
      updated_by = auth.uid(),
      archived_at = case
        when coalesce(p_product->>'status', status) = 'archived' then coalesce(archived_at, now())
        else null
      end
    where id = v_id;
    if not found then raise exception 'PRICE mahsuloti topilmadi'; end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) - 'id' - 'product_id' - 'created_at' - 'updated_at' order by t.min_value), '[]'::jsonb)
  into v_old_tiers from public.pricing_price_tiers t where t.product_id = v_id;

  delete from public.pricing_price_tiers where product_id = v_id;
  for v_tier in select value from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.pricing_price_tiers (
      product_id, min_value, max_value, unit_price, setup_price, label, sort_order
    ) values (
      v_id,
      (v_tier->>'min_value')::numeric,
      nullif(v_tier->>'max_value', '')::numeric,
      (v_tier->>'unit_price')::numeric,
      coalesce(nullif(v_tier->>'setup_price', '')::numeric, 0),
      nullif(trim(v_tier->>'label'), ''),
      coalesce(nullif(v_tier->>'sort_order', '')::integer, 0)
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(t) - 'id' - 'product_id' - 'created_at' - 'updated_at' order by t.min_value), '[]'::jsonb)
  into v_new_tiers from public.pricing_price_tiers t where t.product_id = v_id;

  if v_old_tiers is distinct from v_new_tiers then
    select full_name into v_changed_by_name from public.crm_profiles where id = auth.uid();
    insert into public.pricing_price_history (
      product_id, product_name, entity_type, entity_id, action,
      old_data, new_data, changed_by, changed_by_name
    ) select
      p.id, p.name, 'tier_set', p.id, 'update',
      v_old_tiers, v_new_tiers, auth.uid(),
      coalesce(v_changed_by_name, 'Noma''lum foydalanuvchi')
    from public.pricing_products p where p.id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.pricing_set_archived(
  p_product_id bigint,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.pricing_is_admin() then
    raise exception 'PRICE arxivini boshqarish uchun owner yoki admin roli kerak'
      using errcode = 'insufficient_privilege';
  end if;
  update public.pricing_products
  set status = case when p_archived then 'archived' else 'active' end,
      archived_at = case when p_archived then now() else null end,
      updated_by = auth.uid()
  where id = p_product_id;
  if not found then raise exception 'PRICE mahsuloti topilmadi'; end if;
end;
$$;

create or replace function public.pricing_quote(
  p_product_id bigint,
  p_quantity numeric default 1,
  p_area_m2 numeric default null,
  p_length_m numeric default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_product public.pricing_products%rowtype;
  v_tier public.pricing_price_tiers%rowtype;
  v_basis numeric;
  v_unit_price numeric;
  v_total numeric;
begin
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Miqdor 0 dan katta bo''lishi kerak';
  end if;

  select * into v_product from public.pricing_products where id = p_product_id;
  if not found then raise exception 'PRICE mahsuloti topilmadi'; end if;

  -- Admins may inspect inactive records, but they must never produce a quote.
  if v_product.status <> 'active' then
    return jsonb_build_object(
      'available', false,
      'status', v_product.status,
      'message', 'Faol bo''lmagan mahsulot uchun narx berilmaydi'
    );
  end if;

  if p_quantity < v_product.min_quantity then
    return jsonb_build_object(
      'available', false,
      'message', 'Minimum miqdor: ' || v_product.min_quantity || ' ' || v_product.unit
    );
  end if;

  if v_product.pricing_mode = 'calculator' then
    return jsonb_build_object(
      'available', false, 'requires_calculator', true,
      'pricing_source_key', v_product.pricing_source_key,
      'message', 'Bu mahsulot kanonik kalkulyator orqali hisoblanadi'
    );
  elsif v_product.pricing_mode = 'manual' then
    return jsonb_build_object(
      'available', false, 'requires_manual_price', true,
      'message', 'Bu mahsulot uchun individual narx beriladi'
    );
  end if;

  v_basis := case v_product.pricing_mode
    when 'area' then coalesce(p_area_m2, 0) * p_quantity
    when 'linear_meter' then coalesce(p_length_m, 0) * p_quantity
    else p_quantity
  end;

  if v_basis <= 0 then
    raise exception 'Narxlash uchun maydon yoki uzunlik kiriting';
  end if;

  if v_product.pricing_mode = 'quantity_tier' then
    select * into v_tier
    from public.pricing_price_tiers
    where product_id = p_product_id and is_active
      and min_value <= v_basis
      and (max_value is null or max_value >= v_basis)
    order by min_value desc limit 1;
    if not found then
      return jsonb_build_object('available', false, 'message', 'Bu miqdor uchun tasdiqlangan tarif topilmadi');
    end if;
    v_unit_price := v_tier.unit_price;
  else
    select * into v_tier
    from public.pricing_price_tiers
    where product_id = p_product_id and is_active
      and min_value <= v_basis
      and (max_value is null or max_value >= v_basis)
    order by min_value desc limit 1;
    v_unit_price := coalesce(v_tier.unit_price, v_product.base_price);
  end if;

  v_total := round(v_basis * v_unit_price + coalesce(v_tier.setup_price, 0), 2);
  return jsonb_build_object(
    'available', true,
    'product_id', v_product.id,
    'product_name', v_product.name,
    'pricing_mode', v_product.pricing_mode,
    'pricing_source_key', v_product.pricing_source_key,
    'quantity', p_quantity,
    'basis', v_basis,
    'unit', v_product.unit,
    'unit_price', v_unit_price,
    'setup_price', coalesce(v_tier.setup_price, 0),
    'tier_label', v_tier.label,
    'total', v_total,
    'currency', v_product.currency
  );
end;
$$;

revoke all on table public.pricing_products from anon;
revoke all on table public.pricing_price_tiers from anon;
revoke all on table public.pricing_favorites from anon;
revoke all on table public.pricing_price_history from anon;
-- Supabase projects may grant broad public-schema table privileges to the
-- authenticated role by default. PRICE business writes must go through the
-- server-authorized RPCs below, so reset those defaults before granting the
-- intentionally narrow read/favorite permissions.
revoke all on table public.pricing_products from authenticated;
revoke all on table public.pricing_price_tiers from authenticated;
revoke all on table public.pricing_favorites from authenticated;
revoke all on table public.pricing_price_history from authenticated;
revoke all on function public.pricing_save_product(jsonb, jsonb) from public;
revoke all on function public.pricing_set_archived(bigint, boolean) from public;
revoke all on function public.pricing_quote(bigint, numeric, numeric, numeric) from public;
revoke all on function public.pricing_touch_updated_at() from public;
revoke all on function public.pricing_reject_tier_range_collision() from public;
revoke all on function public.pricing_write_history() from public;
-- Supabase may also materialize default EXECUTE grants directly on its API
-- roles. Clear those explicitly; the public RPCs are granted back below.
revoke all on function public.pricing_is_admin() from anon, authenticated;
revoke all on function public.pricing_save_product(jsonb, jsonb) from anon, authenticated;
revoke all on function public.pricing_set_archived(bigint, boolean) from anon, authenticated;
revoke all on function public.pricing_quote(bigint, numeric, numeric, numeric) from anon, authenticated;
revoke all on function public.pricing_touch_updated_at() from anon, authenticated;
revoke all on function public.pricing_reject_tier_range_collision() from anon, authenticated;
revoke all on function public.pricing_write_history() from anon, authenticated;

grant select on public.pricing_products to authenticated;
grant select on public.pricing_price_tiers to authenticated;
grant select, insert, delete on public.pricing_favorites to authenticated;
grant select on public.pricing_price_history to authenticated;
grant execute on function public.pricing_is_admin() to authenticated;
grant execute on function public.pricing_save_product(jsonb, jsonb) to authenticated;
grant execute on function public.pricing_set_archived(bigint, boolean) to authenticated;
grant execute on function public.pricing_quote(bigint, numeric, numeric, numeric) to authenticated;

commit;
