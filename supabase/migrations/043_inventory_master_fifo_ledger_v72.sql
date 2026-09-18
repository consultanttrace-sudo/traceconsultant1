-- v72.13 — Inventory module, Tahap 1/3 (REVISI).
-- KOREKSI PENTING: trace_inventory_items sudah ada sejak
-- 024_business_intelligence_platform.sql (dipakai pipeline ingestion POS,
-- inventoryIntelligence.js, trace_read_client_dataset). Revisi ini TIDAK
-- membuat tabel item duplikat — hanya menambah kolom yang belum ada, dan
-- mengikuti pola scoping organization_id/outlet_id (text) yang sudah
-- dipakai di seluruh tabel operasional client, bukan tabel "locations"
-- ber-UUID terpisah seperti versi awal.
--
-- Costing: FIFO layer-based (trace_inventory_stock_lots).

-- ============================================================
-- 1. Perluas trace_inventory_items (existing) — kolom baru, non-destruktif
-- ============================================================
alter table public.trace_inventory_items
  add column if not exists category text,
  add column if not exists uom_purchase text,
  add column if not exists uom_conversion_factor numeric not null default 1,
  add column if not exists reorder_point numeric not null default 0,
  add column if not exists reorder_qty numeric not null default 0;

alter table public.trace_inventory_items
  drop constraint if exists trace_inventory_items_uom_conv_chk;
alter table public.trace_inventory_items
  add constraint trace_inventory_items_uom_conv_chk check (uom_conversion_factor > 0);

-- ============================================================
-- 2. RPC — perluas CRUD item yang SUDAH ADA (040_fnb_operational_manual_crud.sql)
--    dengan field baru, alih-alih membuat overload kedua yang membingungkan.
--    Signature 6/8-param lama (p_client_id,p_outlet_id,p_sku,p_item_name,
--    p_unit,p_unit_cost[,p_active]) di-drop dulu supaya tidak ada 2 fungsi
--    bernama sama yang tumpang tindih; field baru ditambahkan sebagai
--    parameter opsional di akhir sehingga pemanggilan lama yang hanya
--    mengisi param wajib tetap kompatibel.
-- ============================================================
drop function if exists public.trace_create_inventory_item(text,text,text,text,text,numeric);
create or replace function public.trace_create_inventory_item(
  p_client_id text,p_outlet_id text,p_sku text,p_item_name text,p_unit text,p_unit_cost numeric,
  p_category text default null,p_uom_purchase text default null,p_uom_conversion_factor numeric default 1,
  p_reorder_point numeric default 0,p_reorder_qty numeric default 0)
returns uuid
language plpgsql security definer set search_path=public as $$
declare v uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_INVENTORY_ACTOR_FORBIDDEN'; end if;
  insert into public.trace_inventory_items(
    organization_id,outlet_id,sku,item_name,unit,unit_cost,category,uom_purchase,
    uom_conversion_factor,reorder_point,reorder_qty,created_by)
  values(
    trim(p_client_id),nullif(trim(p_outlet_id),''),nullif(trim(p_sku),''),trim(p_item_name),
    trim(p_unit),p_unit_cost,nullif(trim(p_category),''),nullif(trim(p_uom_purchase),''),
    coalesce(p_uom_conversion_factor,1),coalesce(p_reorder_point,0),coalesce(p_reorder_qty,0),auth.uid())
  returning id into v;
  perform public.trace_append_audit_event('insert','inventory_item',v::text,null,
    jsonb_build_object('client_id',p_client_id,'item_name',p_item_name,'unit_cost',p_unit_cost),null);
  return v;
end; $$;
revoke all on function public.trace_create_inventory_item(text,text,text,text,text,numeric,text,text,numeric,numeric,numeric) from public;
grant execute on function public.trace_create_inventory_item(text,text,text,text,text,numeric,text,text,numeric,numeric,numeric) to authenticated;

drop function if exists public.trace_update_inventory_item(uuid,text,text,text,text,text,numeric,boolean);
create or replace function public.trace_update_inventory_item(
  p_id uuid,p_client_id text,p_outlet_id text,p_sku text,p_item_name text,p_unit text,p_unit_cost numeric,
  p_active boolean,p_category text default null,p_uom_purchase text default null,
  p_uom_conversion_factor numeric default null,p_reorder_point numeric default null,p_reorder_qty numeric default null)
returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_INVENTORY_ACTOR_FORBIDDEN'; end if;
  update public.trace_inventory_items set
    outlet_id=nullif(trim(p_outlet_id),''),sku=nullif(trim(p_sku),''),item_name=trim(p_item_name),
    unit=trim(p_unit),unit_cost=p_unit_cost,active=coalesce(p_active,true),
    category=coalesce(nullif(trim(p_category),''),category),
    uom_purchase=coalesce(nullif(trim(p_uom_purchase),''),uom_purchase),
    uom_conversion_factor=coalesce(p_uom_conversion_factor,uom_conversion_factor),
    reorder_point=coalesce(p_reorder_point,reorder_point),
    reorder_qty=coalesce(p_reorder_qty,reorder_qty)
  where id=p_id and organization_id=trim(p_client_id);
  if not found then raise exception 'TRACE_INVENTORY_ITEM_NOT_FOUND'; end if;
  return true;
end; $$;
revoke all on function public.trace_update_inventory_item(uuid,text,text,text,text,text,numeric,boolean,text,text,numeric,numeric,numeric) from public;
grant execute on function public.trace_update_inventory_item(uuid,text,text,text,text,text,numeric,boolean,text,text,numeric,numeric,numeric) to authenticated;

create or replace function public.trace_list_inventory_items(p_client_id text,p_outlet_id text default null,p_active_only boolean default true)
returns setof public.trace_inventory_items
language sql stable security definer set search_path=public as $$
  select * from public.trace_inventory_items
  where public.trace_is_team_member()
    and organization_id = trim(p_client_id)
    and (p_outlet_id is null or outlet_id = p_outlet_id)
    and (not p_active_only or active)
  order by item_name asc;
$$;
revoke all on function public.trace_list_inventory_items(text,text,boolean) from public;
grant execute on function public.trace_list_inventory_items(text,text,boolean) to authenticated;

-- ============================================================
-- 3. STOCK LOTS (FIFO cost layers) — scoping organization_id/outlet_id
--    konsisten dengan trace_inventory_movements yang sudah ada
-- ============================================================
create table if not exists public.trace_inventory_stock_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  item_id uuid not null references public.trace_inventory_items(id) on delete restrict,
  lot_no text not null default to_char(now(),'YYYYMMDDHH24MISS'),
  qty_received numeric not null check (qty_received > 0),
  qty_remaining numeric not null check (qty_remaining >= 0),
  unit_cost numeric not null check (unit_cost >= 0),
  source_ref text,
  received_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict
);
create index if not exists trace_inv_lots_scope_item_idx
  on public.trace_inventory_stock_lots(organization_id, outlet_id, item_id, received_at)
  where qty_remaining > 0;
alter table public.trace_inventory_stock_lots enable row level security;
revoke all on public.trace_inventory_stock_lots from anon, authenticated;
grant select on public.trace_inventory_stock_lots to authenticated;
drop policy if exists trace_inv_lots_team_select on public.trace_inventory_stock_lots;
create policy trace_inv_lots_team_select on public.trace_inventory_stock_lots
for select to authenticated using (public.trace_is_team_member());

-- ============================================================
-- 4. LEDGER (kartu stok — mutasi + running balance)
--    Terpisah dari trace_inventory_movements (024) yang merekam mutasi
--    mentah dari ingestion POS; ledger ini adalah kartu stok bernilai
--    (running qty & value) yang jadi dasar valuasi & opname.
-- ============================================================
create table if not exists public.trace_inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  item_id uuid not null references public.trace_inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('receive','issue','adjustment','opname')),
  qty numeric not null,
  unit_cost numeric not null default 0,
  balance_qty numeric not null,
  balance_value numeric not null,
  ref_type text,
  ref_id uuid,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trace_inv_ledger_scope_item_idx
  on public.trace_inventory_ledger(organization_id, outlet_id, item_id, created_at);
alter table public.trace_inventory_ledger enable row level security;
revoke all on public.trace_inventory_ledger from anon, authenticated;
grant select on public.trace_inventory_ledger to authenticated;
drop policy if exists trace_inv_ledger_team_select on public.trace_inventory_ledger;
create policy trace_inv_ledger_team_select on public.trace_inventory_ledger
for select to authenticated using (public.trace_is_team_member());

-- ============================================================
-- 5. RPC — receive stock (buka lot FIFO baru + catat ledger)
-- ============================================================
create or replace function public.trace_receive_stock(
  p_client_id text,p_outlet_id text,p_item_id uuid,p_qty numeric,p_unit_cost numeric,
  p_source_ref text,p_notes text)
returns public.trace_inventory_ledger
language plpgsql security definer set search_path=public as $$
declare
  v_lot public.trace_inventory_stock_lots;
  v_ledger public.trace_inventory_ledger;
  v_prev_qty numeric; v_prev_val numeric;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_INV_ACTOR_FORBIDDEN'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'TRACE_INV_QTY_MUST_BE_POSITIVE'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'TRACE_INV_COST_INVALID'; end if;
  if not exists (select 1 from public.trace_inventory_items where id=p_item_id and organization_id=trim(p_client_id)) then
    raise exception 'TRACE_INV_ITEM_SCOPE_MISMATCH'; end if;

  select coalesce(sum(qty_remaining),0), coalesce(sum(qty_remaining*unit_cost),0)
    into v_prev_qty, v_prev_val
  from public.trace_inventory_stock_lots
  where item_id=p_item_id and organization_id=trim(p_client_id)
    and outlet_id is not distinct from p_outlet_id;

  insert into public.trace_inventory_stock_lots(organization_id,outlet_id,item_id,qty_received,qty_remaining,unit_cost,source_ref,created_by)
  values(trim(p_client_id),p_outlet_id,p_item_id,p_qty,p_qty,p_unit_cost,nullif(trim(p_source_ref),''),auth.uid())
  returning * into v_lot;

  insert into public.trace_inventory_ledger(
    organization_id,outlet_id,item_id,movement_type,qty,unit_cost,balance_qty,balance_value,ref_type,ref_id,notes,created_by)
  values(
    trim(p_client_id),p_outlet_id,p_item_id,'receive',p_qty,p_unit_cost,
    v_prev_qty+p_qty, v_prev_val+(p_qty*p_unit_cost),
    'stock_lot',v_lot.id,nullif(trim(p_notes),''),auth.uid())
  returning * into v_ledger;

  perform public.trace_append_audit_event('receive','inventory_stock',v_lot.id::text,null,to_jsonb(v_ledger),null);
  return v_ledger;
end; $$;
revoke all on function public.trace_receive_stock(text,text,uuid,numeric,numeric,text,text) from public;
grant execute on function public.trace_receive_stock(text,text,uuid,numeric,numeric,text,text) to authenticated;

-- ============================================================
-- 6. RPC — issue stock (konsumsi FIFO dari lot tertua dulu)
-- ============================================================
create or replace function public.trace_issue_stock(
  p_client_id text,p_outlet_id text,p_item_id uuid,p_qty numeric,p_ref_type text,p_ref_id uuid,p_notes text)
returns public.trace_inventory_ledger
language plpgsql security definer set search_path=public as $$
declare
  v_remaining numeric := p_qty;
  v_lot record;
  v_take numeric;
  v_total_cost numeric := 0;
  v_prev_qty numeric; v_prev_val numeric;
  v_ledger public.trace_inventory_ledger;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_INV_ACTOR_FORBIDDEN'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'TRACE_INV_QTY_MUST_BE_POSITIVE'; end if;

  select coalesce(sum(qty_remaining),0), coalesce(sum(qty_remaining*unit_cost),0)
    into v_prev_qty, v_prev_val
  from public.trace_inventory_stock_lots
  where item_id=p_item_id and organization_id=trim(p_client_id)
    and outlet_id is not distinct from p_outlet_id;

  if v_prev_qty < p_qty then raise exception 'TRACE_INV_INSUFFICIENT_STOCK'; end if;

  for v_lot in
    select * from public.trace_inventory_stock_lots
    where item_id=p_item_id and organization_id=trim(p_client_id)
      and outlet_id is not distinct from p_outlet_id and qty_remaining > 0
    order by received_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_lot.qty_remaining);
    update public.trace_inventory_stock_lots
      set qty_remaining = qty_remaining - v_take
      where id = v_lot.id;
    v_total_cost := v_total_cost + (v_take * v_lot.unit_cost);
    v_remaining := v_remaining - v_take;
  end loop;

  insert into public.trace_inventory_ledger(
    organization_id,outlet_id,item_id,movement_type,qty,unit_cost,balance_qty,balance_value,ref_type,ref_id,notes,created_by)
  values(
    trim(p_client_id),p_outlet_id,p_item_id,'issue',-p_qty,
    round(v_total_cost/p_qty,4),
    v_prev_qty-p_qty, v_prev_val-v_total_cost,
    nullif(trim(p_ref_type),''),p_ref_id,nullif(trim(p_notes),''),auth.uid())
  returning * into v_ledger;

  perform public.trace_append_audit_event('issue','inventory_stock',p_item_id::text,null,to_jsonb(v_ledger),null);
  return v_ledger;
end; $$;
revoke all on function public.trace_issue_stock(text,text,uuid,numeric,text,uuid,text) from public;
grant execute on function public.trace_issue_stock(text,text,uuid,numeric,text,uuid,text) to authenticated;

-- ============================================================
-- 7. RPC — posisi stok saat ini (dasar snapshot opname Tahap 2)
-- ============================================================
create or replace function public.trace_inventory_position(p_client_id text,p_outlet_id text default null)
returns table(item_id uuid, qty_on_hand numeric, value_on_hand numeric, avg_unit_cost numeric)
language sql stable security definer set search_path=public as $$
  select l.item_id,
         coalesce(sum(l.qty_remaining),0) as qty_on_hand,
         coalesce(sum(l.qty_remaining*l.unit_cost),0) as value_on_hand,
         case when coalesce(sum(l.qty_remaining),0) > 0
           then round(sum(l.qty_remaining*l.unit_cost)/sum(l.qty_remaining),4) else 0 end as avg_unit_cost
  from public.trace_inventory_stock_lots l
  where public.trace_is_team_member()
    and l.organization_id = trim(p_client_id)
    and (p_outlet_id is null or l.outlet_id is not distinct from p_outlet_id)
  group by l.item_id;
$$;
revoke all on function public.trace_inventory_position(text,text) from public;
grant execute on function public.trace_inventory_position(text,text) to authenticated;
