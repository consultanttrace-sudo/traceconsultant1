-- TRACE v72.3 — Piutang (AR), Utang (AP), Aset Tetap, dan Tutup Buku Periode.
-- Melengkapi 4 dari 8 modul akuntansi yang sebelumnya hanya berupa logic
-- TypeScript (src/core/accountsReceivable.ts, accountsPayable.ts,
-- fixedAssets.ts, periodClose.ts) tanpa tabel Supabase.
--
-- Pola yang dipakai sama persis dengan 028_accounting_and_cogs_v72.sql:
-- RLS fail-closed (revoke semua akses langsung), semua baca/tulis lewat
-- RPC security definer yang mengecek trace_is_team_member() dan mencatat
-- audit event lewat trace_append_audit_event().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PIUTANG USAHA (ACCOUNTS RECEIVABLE)
-- ---------------------------------------------------------------------------
create table if not exists public.trace_ar_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  customer_name text not null check (btrim(customer_name) <> ''),
  invoice_date date not null,
  due_date date not null check (due_date >= invoice_date),
  amount numeric not null check (amount > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trace_ar_invoices_client_idx on public.trace_ar_invoices(client_id, due_date);

create table if not exists public.trace_ar_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.trace_ar_invoices(id) on delete restrict,
  client_id text not null,
  amount numeric not null check (amount > 0),
  paid_date date not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trace_ar_payments_invoice_idx on public.trace_ar_payments(invoice_id);

-- ---------------------------------------------------------------------------
-- UTANG USAHA (ACCOUNTS PAYABLE)
-- ---------------------------------------------------------------------------
create table if not exists public.trace_ap_bills (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  vendor_name text not null check (btrim(vendor_name) <> ''),
  bill_date date not null,
  due_date date not null check (due_date >= bill_date),
  amount numeric not null check (amount > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trace_ap_bills_client_idx on public.trace_ap_bills(client_id, due_date);

create table if not exists public.trace_ap_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.trace_ap_bills(id) on delete restrict,
  client_id text not null,
  amount numeric not null check (amount > 0),
  paid_date date not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trace_ap_payments_bill_idx on public.trace_ap_payments(bill_id);

-- ---------------------------------------------------------------------------
-- ASET TETAP & PENYUSUTAN (FIXED ASSETS)
-- ---------------------------------------------------------------------------
create table if not exists public.trace_fixed_assets (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  name text not null check (btrim(name) <> ''),
  acquisition_date date not null,
  acquisition_cost numeric not null check (acquisition_cost >= 0),
  useful_life_months integer not null check (useful_life_months > 0),
  residual_value numeric not null default 0 check (residual_value >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (residual_value <= acquisition_cost)
);
create index if not exists trace_fixed_assets_client_idx on public.trace_fixed_assets(client_id);

-- ---------------------------------------------------------------------------
-- TUTUP BUKU (PERIOD LOCK)
-- ---------------------------------------------------------------------------
create table if not exists public.trace_period_locks (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  locked_at timestamptz not null default now(),
  locked_by uuid not null references auth.users(id) on delete restrict,
  unique(client_id, period)
);
create index if not exists trace_period_locks_client_idx on public.trace_period_locks(client_id);

-- ---------------------------------------------------------------------------
-- RLS fail-closed: tidak ada akses langsung dari browser ke tabel-tabel ini.
-- ---------------------------------------------------------------------------
alter table public.trace_ar_invoices enable row level security;
alter table public.trace_ar_payments enable row level security;
alter table public.trace_ap_bills enable row level security;
alter table public.trace_ap_payments enable row level security;
alter table public.trace_fixed_assets enable row level security;
alter table public.trace_period_locks enable row level security;
revoke all on
  public.trace_ar_invoices, public.trace_ar_payments,
  public.trace_ap_bills, public.trace_ap_payments,
  public.trace_fixed_assets, public.trace_period_locks
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC tulis: piutang
-- ---------------------------------------------------------------------------
create or replace function public.trace_create_ar_invoice(
  p_client_id text, p_customer_name text, p_invoice_date date, p_due_date date, p_amount numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_AR_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id), '') is null then raise exception 'TRACE_AR_SCOPE_REQUIRED'; end if;
  insert into public.trace_ar_invoices(client_id, customer_name, invoice_date, due_date, amount, created_by)
  values (trim(p_client_id), p_customer_name, p_invoice_date, p_due_date, p_amount, auth.uid())
  returning id into new_id;
  perform public.trace_append_audit_event('insert', 'ar_invoice', new_id::text, null,
    jsonb_build_object('client_id', p_client_id, 'amount', p_amount), null);
  return new_id;
end; $$;
revoke all on function public.trace_create_ar_invoice(text, text, date, date, numeric) from public;
grant execute on function public.trace_create_ar_invoice(text, text, date, date, numeric) to authenticated;

create or replace function public.trace_record_ar_payment(
  p_invoice_id uuid, p_amount numeric, p_paid_date date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; scoped_client text;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_AR_ACTOR_FORBIDDEN'; end if;
  select client_id into scoped_client from public.trace_ar_invoices where id = p_invoice_id;
  if scoped_client is null then raise exception 'TRACE_AR_INVOICE_NOT_FOUND'; end if;
  insert into public.trace_ar_payments(invoice_id, client_id, amount, paid_date, created_by)
  values (p_invoice_id, scoped_client, p_amount, p_paid_date, auth.uid())
  returning id into new_id;
  perform public.trace_append_audit_event('insert', 'ar_payment', new_id::text, null,
    jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount), null);
  return new_id;
end; $$;
revoke all on function public.trace_record_ar_payment(uuid, numeric, date) from public;
grant execute on function public.trace_record_ar_payment(uuid, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC tulis: utang
-- ---------------------------------------------------------------------------
create or replace function public.trace_create_ap_bill(
  p_client_id text, p_vendor_name text, p_bill_date date, p_due_date date, p_amount numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_AP_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id), '') is null then raise exception 'TRACE_AP_SCOPE_REQUIRED'; end if;
  insert into public.trace_ap_bills(client_id, vendor_name, bill_date, due_date, amount, created_by)
  values (trim(p_client_id), p_vendor_name, p_bill_date, p_due_date, p_amount, auth.uid())
  returning id into new_id;
  perform public.trace_append_audit_event('insert', 'ap_bill', new_id::text, null,
    jsonb_build_object('client_id', p_client_id, 'amount', p_amount), null);
  return new_id;
end; $$;
revoke all on function public.trace_create_ap_bill(text, text, date, date, numeric) from public;
grant execute on function public.trace_create_ap_bill(text, text, date, date, numeric) to authenticated;

create or replace function public.trace_record_ap_payment(
  p_bill_id uuid, p_amount numeric, p_paid_date date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; scoped_client text;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_AP_ACTOR_FORBIDDEN'; end if;
  select client_id into scoped_client from public.trace_ap_bills where id = p_bill_id;
  if scoped_client is null then raise exception 'TRACE_AP_BILL_NOT_FOUND'; end if;
  insert into public.trace_ap_payments(bill_id, client_id, amount, paid_date, created_by)
  values (p_bill_id, scoped_client, p_amount, p_paid_date, auth.uid())
  returning id into new_id;
  perform public.trace_append_audit_event('insert', 'ap_payment', new_id::text, null,
    jsonb_build_object('bill_id', p_bill_id, 'amount', p_amount), null);
  return new_id;
end; $$;
revoke all on function public.trace_record_ap_payment(uuid, numeric, date) from public;
grant execute on function public.trace_record_ap_payment(uuid, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC tulis: aset tetap
-- ---------------------------------------------------------------------------
create or replace function public.trace_create_fixed_asset(
  p_client_id text, p_name text, p_acquisition_date date,
  p_acquisition_cost numeric, p_useful_life_months integer, p_residual_value numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_FIXED_ASSET_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id), '') is null then raise exception 'TRACE_FIXED_ASSET_SCOPE_REQUIRED'; end if;
  insert into public.trace_fixed_assets(
    client_id, name, acquisition_date, acquisition_cost, useful_life_months, residual_value, created_by
  ) values (
    trim(p_client_id), p_name, p_acquisition_date, p_acquisition_cost,
    p_useful_life_months, coalesce(p_residual_value, 0), auth.uid()
  ) returning id into new_id;
  perform public.trace_append_audit_event('insert', 'fixed_asset', new_id::text, null,
    jsonb_build_object('client_id', p_client_id, 'acquisition_cost', p_acquisition_cost), null);
  return new_id;
end; $$;
revoke all on function public.trace_create_fixed_asset(text, text, date, numeric, integer, numeric) from public;
grant execute on function public.trace_create_fixed_asset(text, text, date, numeric, integer, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC tulis: tutup buku (period lock) — sekali dikunci, tidak ada RPC untuk
-- membuka kunci lagi. Ini sesuai komentar di periodClose.ts: koreksi periode
-- terkunci harus lewat jurnal penyesuaian di periode berjalan, bukan buka kunci.
-- ---------------------------------------------------------------------------
create or replace function public.trace_lock_period(
  p_client_id text, p_period text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_PERIOD_LOCK_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id), '') is null then raise exception 'TRACE_PERIOD_LOCK_SCOPE_REQUIRED'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'TRACE_PERIOD_LOCK_FORMAT_INVALID'; end if;
  insert into public.trace_period_locks(client_id, period, locked_by)
  values (trim(p_client_id), p_period, auth.uid())
  returning id into new_id;
  perform public.trace_append_audit_event('insert', 'period_lock', new_id::text, null,
    jsonb_build_object('client_id', p_client_id, 'period', p_period), null);
  return new_id;
end; $$;
revoke all on function public.trace_lock_period(text, text) from public;
grant execute on function public.trace_lock_period(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tutup celah nyata: sebelumnya trace_post_balanced_journal (028) tidak tahu
-- apa-apa soal period lock. Sekarang jurnal baru ditolak kalau bulan
-- entry_date-nya sudah dikunci untuk client itu — inilah yang bikin
-- assertPeriodNotLocked() di periodClose.ts benar-benar berlaku sampai ke
-- database, bukan cuma dicek di kode aplikasi yang bisa dilewati.
-- ---------------------------------------------------------------------------
create or replace function public.trace_post_balanced_journal(
  p_client_id text,p_entry_date date,p_reference_type text,p_reference_id text,p_memo text,p_source text,p_lines jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare entry_id uuid; line jsonb; total_debit numeric:=0; total_credit numeric:=0; account uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_JOURNAL_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is null or nullif(trim(p_memo),'') is null then raise exception 'TRACE_JOURNAL_SCOPE_REQUIRED'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then raise exception 'TRACE_JOURNAL_LINES_REQUIRED'; end if;
  if exists(
    select 1 from public.trace_period_locks pl
    where pl.client_id = trim(p_client_id) and pl.period = to_char(p_entry_date,'YYYY-MM')
  ) then raise exception 'TRACE_JOURNAL_PERIOD_LOCKED'; end if;
  insert into public.trace_journal_entries(client_id,entry_date,reference_type,reference_id,memo,source,created_by)
  values(trim(p_client_id),p_entry_date,p_reference_type,p_reference_id,p_memo,p_source,auth.uid()) returning id into entry_id;
  for line in select * from jsonb_array_elements(p_lines) loop
    account := (line->>'account_id')::uuid;
    if not exists(select 1 from public.trace_accounts a where a.id=account and a.client_id=trim(p_client_id) and a.active) then raise exception 'TRACE_ACCOUNT_SCOPE_MISMATCH'; end if;
    insert into public.trace_journal_lines(entry_id,client_id,account_id,debit,credit,memo)
    values(entry_id,trim(p_client_id),account,coalesce((line->>'debit')::numeric,0),coalesce((line->>'credit')::numeric,0),line->>'memo');
    total_debit := total_debit + coalesce((line->>'debit')::numeric,0);
    total_credit := total_credit + coalesce((line->>'credit')::numeric,0);
  end loop;
  if total_debit <= 0 or total_debit <> total_credit then raise exception 'TRACE_JOURNAL_NOT_BALANCED'; end if;
  perform public.trace_append_audit_event('insert','journal_entry',entry_id::text,null,jsonb_build_object('client_id',p_client_id,'debit',total_debit,'credit',total_credit),null);
  return entry_id;
end; $$;
revoke all on function public.trace_post_balanced_journal(text,date,text,text,text,text,jsonb) from public;
grant execute on function public.trace_post_balanced_journal(text,date,text,text,text,text,jsonb) to authenticated;

comment on table public.trace_ar_invoices is 'Client-scoped AR invoices (piutang usaha).';
comment on table public.trace_ar_payments is 'Client-scoped payments applied against AR invoices.';
comment on table public.trace_ap_bills is 'Client-scoped AP bills from vendors (utang usaha).';
comment on table public.trace_ap_payments is 'Client-scoped payments applied against AP bills.';
comment on table public.trace_fixed_assets is 'Client-scoped fixed assets for straight-line depreciation.';
comment on table public.trace_period_locks is 'Client-scoped accounting period locks; one-way (no unlock RPC).';
