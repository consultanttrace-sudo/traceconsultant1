-- TRACE Finance Statement Structure + Sales Transaction foundation.
-- Additive/alter only, non-destructive to existing rows.

-- 1) Extend trace_finance_records with hierarchical statement fields.
alter table public.trace_finance_records
  add column if not exists account_label text,
  add column if not exists statement_section text;

alter table public.trace_finance_records
  add constraint trace_finance_records_section_chk
  check (statement_section is null or statement_section in (
    'pendapatan_usaha','biaya_produksi','biaya_usaha_lain',
    'biaya_operasional','biaya_non_operasional','pendapatan_lain','pengeluaran_lain'
  )) not valid;
-- not valid: existing rows (category-only, pre-migration) are grandfathered in;
-- new rows written via the RPC below always set statement_section.

-- Replace the upsert RPC to also accept account_label + statement_section.
-- Old signature is dropped explicitly so no orphaned overload remains callable.
drop function if exists public.trace_upsert_finance_record(uuid,text,text,text,text,numeric,text,text,bigint,text);

create or replace function public.trace_upsert_finance_record(
  p_id uuid,
  p_client_id text,
  p_outlet_id text,
  p_period text,
  p_category text,
  p_amount numeric,
  p_evidence_source text,
  p_evidence_note text,
  p_expected_version bigint default null,
  p_reason text default null,
  p_account_label text default null,
  p_statement_section text default null
) returns public.trace_finance_records
language plpgsql security definer set search_path=public as $$
declare r public.trace_finance_records;
declare before_json jsonb;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_FINANCE_ACTOR_FORBIDDEN'; end if;
  if p_statement_section is not null and p_statement_section not in (
    'pendapatan_usaha','biaya_produksi','biaya_usaha_lain',
    'biaya_operasional','biaya_non_operasional','pendapatan_lain','pengeluaran_lain'
  ) then raise exception 'TRACE_FINANCE_INVALID_SECTION'; end if;

  if p_id is null then
    insert into public.trace_finance_records
      (client_id, outlet_id, period, category, amount, evidence_source, evidence_note, account_label, statement_section, created_by, version)
    values (p_client_id, p_outlet_id, p_period, p_category, p_amount, p_evidence_source, p_evidence_note, p_account_label, p_statement_section, auth.uid(), 1)
    returning * into r;
    insert into public.trace_audit_log(actor_user_id, action, entity_type, entity_id, before_data, after_data, reason)
    values (auth.uid(), 'insert', 'finance_record', r.id::text, null,
      jsonb_build_object('period', r.period, 'category', r.category, 'amount', r.amount, 'account_label', r.account_label, 'statement_section', r.statement_section, 'version', r.version), p_reason);
    return r;
  end if;

  select * into r from public.trace_finance_records where id = p_id for update;
  if not found then raise exception 'TRACE_FINANCE_RECORD_NOT_FOUND'; end if;
  if r.version <> p_expected_version then raise exception 'TRACE_FINANCE_VERSION_MISMATCH'; end if;
  before_json := jsonb_build_object('period', r.period, 'category', r.category, 'amount', r.amount, 'account_label', r.account_label, 'statement_section', r.statement_section, 'version', r.version);

  update public.trace_finance_records set
    outlet_id = p_outlet_id, period = p_period, category = p_category, amount = p_amount,
    evidence_source = p_evidence_source, evidence_note = p_evidence_note,
    account_label = p_account_label, statement_section = p_statement_section,
    version = version + 1, updated_at = now()
  where id = p_id and version = p_expected_version
  returning * into r;
  if not found then raise exception 'TRACE_FINANCE_CONCURRENT_UPDATE'; end if;

  insert into public.trace_audit_log(actor_user_id, action, entity_type, entity_id, before_data, after_data, reason)
  values (auth.uid(), 'update', 'finance_record', r.id::text, before_json,
    jsonb_build_object('period', r.period, 'category', r.category, 'amount', r.amount, 'account_label', r.account_label, 'statement_section', r.statement_section, 'version', r.version), p_reason);
  return r;
end; $$;

revoke all on function public.trace_upsert_finance_record(uuid,text,text,text,text,numeric,text,text,bigint,text,text,text) from public;
grant execute on function public.trace_upsert_finance_record(uuid,text,text,text,text,numeric,text,text,bigint,text,text,text) to authenticated;

-- 2) Product catalog — foundation for the sales dashboard (top product/category/price range).
create table if not exists public.trace_product_catalog (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  outlet_id text,
  product_name text not null,
  menu_category text,
  price numeric not null check (price >= 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trace_product_catalog_client_idx on public.trace_product_catalog(client_id, active);
alter table public.trace_product_catalog enable row level security;
revoke all on public.trace_product_catalog from anon, authenticated;
grant select on public.trace_product_catalog to authenticated;
drop policy if exists trace_product_catalog_team_select on public.trace_product_catalog;
create policy trace_product_catalog_team_select on public.trace_product_catalog for select to authenticated using (public.trace_is_team_member());
drop trigger if exists trg_trace_product_catalog_updated_at on public.trace_product_catalog;
create trigger trg_trace_product_catalog_updated_at before update on public.trace_product_catalog for each row execute function public.trace_set_updated_at();

create or replace function public.trace_upsert_product(
  p_id uuid, p_client_id text, p_outlet_id text, p_product_name text,
  p_menu_category text, p_price numeric, p_active boolean, p_expected_version bigint default null
) returns public.trace_product_catalog
language plpgsql security definer set search_path=public as $$
declare r public.trace_product_catalog;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_PRODUCT_ACTOR_FORBIDDEN'; end if;
  if p_id is null then
    insert into public.trace_product_catalog(client_id,outlet_id,product_name,menu_category,price,active,created_by,version)
    values (p_client_id,p_outlet_id,p_product_name,p_menu_category,p_price,coalesce(p_active,true),auth.uid(),1) returning * into r;
    return r;
  end if;
  select * into r from public.trace_product_catalog where id=p_id for update;
  if not found then raise exception 'TRACE_PRODUCT_NOT_FOUND'; end if;
  if r.version <> p_expected_version then raise exception 'TRACE_PRODUCT_VERSION_MISMATCH'; end if;
  update public.trace_product_catalog set outlet_id=p_outlet_id,product_name=p_product_name,menu_category=p_menu_category,price=p_price,active=coalesce(p_active,active),version=version+1,updated_at=now()
  where id=p_id and version=p_expected_version returning * into r;
  if not found then raise exception 'TRACE_PRODUCT_CONCURRENT_UPDATE'; end if;
  return r;
end; $$;
revoke all on function public.trace_upsert_product(uuid,text,text,text,text,numeric,boolean,bigint) from public;
grant execute on function public.trace_upsert_product(uuid,text,text,text,text,numeric,boolean,bigint) to authenticated;

-- 3) Sales transactions — one row per line-item sale. This is the raw material
-- the dashboard (top product/category/price range/outlet/hour/channel) is computed from.
create table if not exists public.trace_sales_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  outlet_id text,
  product_id uuid references public.trace_product_catalog(id) on delete restrict,
  product_name_snapshot text not null,
  menu_category_snapshot text,
  qty numeric not null check (qty > 0),
  unit_price numeric not null check (unit_price >= 0),
  channel text not null check (channel in ('dine_in','gofood','grabfood','shopeefood','other')),
  sold_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trace_sales_tx_client_time_idx on public.trace_sales_transactions(client_id, sold_at);
create index if not exists trace_sales_tx_outlet_idx on public.trace_sales_transactions(outlet_id, sold_at);
alter table public.trace_sales_transactions enable row level security;
revoke all on public.trace_sales_transactions from anon, authenticated;
grant select on public.trace_sales_transactions to authenticated;
drop policy if exists trace_sales_tx_team_select on public.trace_sales_transactions;
create policy trace_sales_tx_team_select on public.trace_sales_transactions for select to authenticated using (public.trace_is_team_member());

-- Append-only by design: sales lines are corrected with a reversal row, not an UPDATE,
-- so the audit trail always matches what was actually recorded at the time.
create or replace function public.trace_record_sale(
  p_client_id text, p_outlet_id text, p_product_id uuid, p_product_name_snapshot text,
  p_menu_category_snapshot text, p_qty numeric, p_unit_price numeric, p_channel text, p_sold_at timestamptz
) returns public.trace_sales_transactions
language plpgsql security definer set search_path=public as $$
declare r public.trace_sales_transactions;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_SALE_ACTOR_FORBIDDEN'; end if;
  insert into public.trace_sales_transactions
    (client_id,outlet_id,product_id,product_name_snapshot,menu_category_snapshot,qty,unit_price,channel,sold_at,created_by)
  values (p_client_id,p_outlet_id,p_product_id,p_product_name_snapshot,p_menu_category_snapshot,p_qty,p_unit_price,p_channel,p_sold_at,auth.uid())
  returning * into r;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data,reason)
  values (auth.uid(),'insert','sales_transaction',r.id::text,null,
    jsonb_build_object('product',r.product_name_snapshot,'qty',r.qty,'unit_price',r.unit_price,'channel',r.channel,'sold_at',r.sold_at),null);
  return r;
end; $$;
revoke all on function public.trace_record_sale(text,text,uuid,text,text,numeric,numeric,text,timestamptz) from public;
grant execute on function public.trace_record_sale(text,text,uuid,text,text,numeric,numeric,text,timestamptz) to authenticated;
