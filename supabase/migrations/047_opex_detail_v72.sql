-- v72.14 — Labor/OPEX detail module, Tahap B/2: OPEX detail.
-- Roll-up ke trace_finance_records (category='opex') via
-- trace_upsert_finance_record (022). Posting jurnal via
-- trace_post_balanced_journal (028).

-- ============================================================
-- 1. KATEGORI OPEX
-- ============================================================
create table if not exists public.trace_opex_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  code text,
  name text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);
alter table public.trace_opex_categories enable row level security;
revoke all on public.trace_opex_categories from anon, authenticated;
grant select on public.trace_opex_categories to authenticated;
drop policy if exists trace_opex_categories_team_select on public.trace_opex_categories;
create policy trace_opex_categories_team_select on public.trace_opex_categories
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_create_opex_category(p_client_id text,p_code text,p_name text)
returns public.trace_opex_categories
language plpgsql security definer set search_path=public as $$
declare v public.trace_opex_categories;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPEX_ACTOR_FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'TRACE_OPEX_CATEGORY_NAME_REQUIRED'; end if;
  insert into public.trace_opex_categories(organization_id,code,name,created_by)
  values(trim(p_client_id),nullif(trim(p_code),''),trim(p_name),auth.uid())
  returning * into v;
  return v;
end; $$;
revoke all on function public.trace_create_opex_category(text,text,text) from public;
grant execute on function public.trace_create_opex_category(text,text,text) to authenticated;

create or replace function public.trace_list_opex_categories(p_client_id text)
returns setof public.trace_opex_categories
language sql stable security definer set search_path=public as $$
  select * from public.trace_opex_categories
  where public.trace_is_team_member() and organization_id=trim(p_client_id) and is_active
  order by name asc;
$$;
revoke all on function public.trace_list_opex_categories(text) from public;
grant execute on function public.trace_list_opex_categories(text) to authenticated;

-- ============================================================
-- 2. OPEX LINE ITEMS — instance bertanggal DAN template berulang
--    (is_template=true => period NULL, dipakai sbg sumber generator;
--     is_template=false => instance nyata utk satu periode/tanggal jatuh
--     tempo, hasil generate atau input manual satu kali)
-- ============================================================
create table if not exists public.trace_opex_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  opex_category_id uuid not null references public.trace_opex_categories(id) on delete restrict,
  is_template boolean not null default false,
  template_id uuid references public.trace_opex_line_items(id) on delete set null,
  vendor_name text,
  description text,
  amount numeric not null default 0 check (amount >= 0),
  recurrence_frequency text not null default 'one_time'
    check (recurrence_frequency in ('one_time','monthly','quarterly','yearly')),
  period text check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  due_date date,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','partial','paid','overdue')),
  paid_amount numeric not null default 0,
  paid_at timestamptz,
  payment_method text,
  evidence_ref text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_template = (period is null))
);
create index if not exists trace_opex_items_scope_idx
  on public.trace_opex_line_items(organization_id, outlet_id, period, opex_category_id);
create index if not exists trace_opex_items_template_idx
  on public.trace_opex_line_items(organization_id, is_template) where is_template;
alter table public.trace_opex_line_items enable row level security;
revoke all on public.trace_opex_line_items from anon, authenticated;
grant select on public.trace_opex_line_items to authenticated;
drop policy if exists trace_opex_items_team_select on public.trace_opex_line_items;
create policy trace_opex_items_team_select on public.trace_opex_line_items
for select to authenticated using (public.trace_is_team_member());

-- Auto-update status jadi 'overdue' bukan via trigger waktu (butuh cron);
-- disediakan sbg fungsi baca supaya UI/report selalu akurat saat query.
create or replace function public.trace_opex_effective_status(p_due_date date,p_payment_status text)
returns text language sql immutable as $$
  select case
    when p_payment_status='paid' then 'paid'
    when p_due_date is not null and p_due_date < current_date and p_payment_status<>'paid' then 'overdue'
    else p_payment_status
  end;
$$;

-- ============================================================
-- 3. RPC — buat template berulang / item satu kali
-- ============================================================
create or replace function public.trace_create_opex_item(
  p_client_id text,p_outlet_id text,p_opex_category_id uuid,p_vendor_name text,
  p_description text,p_amount numeric,p_recurrence_frequency text,p_period text,
  p_due_date date,p_notes text)
returns public.trace_opex_line_items
language plpgsql security definer set search_path=public as $$
declare v public.trace_opex_line_items; v_is_template boolean;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPEX_ACTOR_FORBIDDEN'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'TRACE_OPEX_AMOUNT_INVALID'; end if;
  v_is_template := coalesce(p_recurrence_frequency,'one_time') <> 'one_time' and p_period is null;
  if not v_is_template and p_period is null then raise exception 'TRACE_OPEX_PERIOD_REQUIRED_FOR_NON_TEMPLATE'; end if;

  insert into public.trace_opex_line_items(
    organization_id,outlet_id,opex_category_id,is_template,vendor_name,description,amount,
    recurrence_frequency,period,due_date,notes,created_by)
  values(
    trim(p_client_id),p_outlet_id,p_opex_category_id,v_is_template,nullif(trim(p_vendor_name),''),
    nullif(trim(p_description),''),p_amount,coalesce(nullif(trim(p_recurrence_frequency),''),'one_time'),
    p_period,p_due_date,nullif(trim(p_notes),''),auth.uid())
  returning * into v;
  perform public.trace_append_audit_event('create','opex_item',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_create_opex_item(text,text,uuid,text,text,numeric,text,text,date,text) from public;
grant execute on function public.trace_create_opex_item(text,text,uuid,text,text,numeric,text,text,date,text) to authenticated;

-- Generator: dari semua template aktif milik organisasi, buat instance
-- untuk periode target kalau frekuensinya jatuh pada periode itu dan
-- belum pernah di-generate (idempoten via unique template_id+period).
create table if not exists public.trace_opex_generated_guard (
  template_id uuid not null references public.trace_opex_line_items(id) on delete cascade,
  period text not null,
  primary key(template_id, period)
);
alter table public.trace_opex_generated_guard enable row level security;
revoke all on public.trace_opex_generated_guard from anon, authenticated;
grant select on public.trace_opex_generated_guard to authenticated;
drop policy if exists trace_opex_gen_guard_team_select on public.trace_opex_generated_guard;
create policy trace_opex_gen_guard_team_select on public.trace_opex_generated_guard
for select to authenticated using (true);

create or replace function public.trace_generate_recurring_opex(p_client_id text,p_period text)
returns setof public.trace_opex_line_items
language plpgsql security definer set search_path=public as $$
declare t record; v_month int; v_due date; v_new public.trace_opex_line_items;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPEX_ACTOR_FORBIDDEN'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'TRACE_OPEX_PERIOD_INVALID'; end if;
  v_month := split_part(p_period,'-',2)::int;

  for t in
    select * from public.trace_opex_line_items
    where organization_id=trim(p_client_id) and is_template=true
      and (
        recurrence_frequency='monthly'
        or (recurrence_frequency='quarterly' and v_month in (1,4,7,10))
        or (recurrence_frequency='yearly' and v_month=1)
      )
  loop
    if exists (select 1 from public.trace_opex_generated_guard where template_id=t.id and period=p_period) then
      continue;
    end if;
    v_due := (p_period||'-01')::date + interval '1 month' - interval '1 day';
    insert into public.trace_opex_line_items(
      organization_id,outlet_id,opex_category_id,is_template,template_id,vendor_name,description,
      amount,recurrence_frequency,period,due_date,created_by)
    values(
      t.organization_id,t.outlet_id,t.opex_category_id,false,t.id,t.vendor_name,t.description,
      t.amount,t.recurrence_frequency,p_period,v_due,auth.uid())
    returning * into v_new;
    insert into public.trace_opex_generated_guard(template_id,period) values(t.id,p_period);
    return next v_new;
  end loop;
  return;
end; $$;
revoke all on function public.trace_generate_recurring_opex(text,text) from public;
grant execute on function public.trace_generate_recurring_opex(text,text) to authenticated;

-- ============================================================
-- 4. RPC — catat pembayaran
-- ============================================================
create or replace function public.trace_record_opex_payment(
  p_line_item_id uuid,p_paid_amount numeric,p_paid_at timestamptz,p_payment_method text,p_evidence_ref text)
returns public.trace_opex_line_items
language plpgsql security definer set search_path=public as $$
declare v public.trace_opex_line_items; v_new_paid numeric;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPEX_ACTOR_FORBIDDEN'; end if;
  select * into v from public.trace_opex_line_items where id=p_line_item_id for update;
  if not found then raise exception 'TRACE_OPEX_ITEM_NOT_FOUND'; end if;
  if v.is_template then raise exception 'TRACE_OPEX_CANNOT_PAY_TEMPLATE'; end if;

  v_new_paid := v.paid_amount + coalesce(p_paid_amount,0);
  update public.trace_opex_line_items set
    paid_amount = v_new_paid,
    payment_status = case when v_new_paid >= v.amount then 'paid' when v_new_paid > 0 then 'partial' else payment_status end,
    paid_at = coalesce(p_paid_at, now()),
    payment_method = coalesce(nullif(trim(p_payment_method),''), payment_method),
    evidence_ref = coalesce(nullif(trim(p_evidence_ref),''), evidence_ref),
    updated_at = now()
  where id=p_line_item_id
  returning * into v;
  perform public.trace_append_audit_event('pay','opex_item',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_record_opex_payment(uuid,numeric,timestamptz,text,text) from public;
grant execute on function public.trace_record_opex_payment(uuid,numeric,timestamptz,text,text) to authenticated;

create or replace function public.trace_list_opex_items(p_client_id text,p_outlet_id text default null,p_period text default null)
returns setof public.trace_opex_line_items
language sql stable security definer set search_path=public as $$
  select * from public.trace_opex_line_items
  where public.trace_is_team_member()
    and organization_id=trim(p_client_id)
    and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id)
    and is_template=false
    and (p_period is null or period=p_period)
  order by due_date asc nulls last;
$$;
revoke all on function public.trace_list_opex_items(text,text,text) from public;
grant execute on function public.trace_list_opex_items(text,text,text) to authenticated;

-- ============================================================
-- 5. BUDGET vs ACTUAL
-- ============================================================
create table if not exists public.trace_opex_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  opex_category_id uuid not null references public.trace_opex_categories(id) on delete restrict,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  budget_amount numeric not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, outlet_id, opex_category_id, period)
);
alter table public.trace_opex_budgets enable row level security;
revoke all on public.trace_opex_budgets from anon, authenticated;
grant select on public.trace_opex_budgets to authenticated;
drop policy if exists trace_opex_budgets_team_select on public.trace_opex_budgets;
create policy trace_opex_budgets_team_select on public.trace_opex_budgets
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_set_opex_budget(
  p_client_id text,p_outlet_id text,p_opex_category_id uuid,p_period text,p_budget_amount numeric)
returns public.trace_opex_budgets
language plpgsql security definer set search_path=public as $$
declare v public.trace_opex_budgets;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPEX_ACTOR_FORBIDDEN'; end if;
  insert into public.trace_opex_budgets(organization_id,outlet_id,opex_category_id,period,budget_amount,created_by)
  values(trim(p_client_id),p_outlet_id,p_opex_category_id,p_period,coalesce(p_budget_amount,0),auth.uid())
  on conflict(organization_id,outlet_id,opex_category_id,period)
  do update set budget_amount=excluded.budget_amount, updated_at=now()
  returning * into v;
  return v;
end; $$;
revoke all on function public.trace_set_opex_budget(text,text,uuid,text,numeric) from public;
grant execute on function public.trace_set_opex_budget(text,text,uuid,text,numeric) to authenticated;

create or replace function public.trace_opex_budget_vs_actual(p_client_id text,p_outlet_id text,p_period text)
returns table(opex_category_id uuid, category_name text, budget_amount numeric, actual_amount numeric, variance_amount numeric, variance_pct numeric)
language sql stable security definer set search_path=public as $$
  select c.id, c.name,
    coalesce(b.budget_amount,0) as budget_amount,
    coalesce(a.actual_amount,0) as actual_amount,
    coalesce(b.budget_amount,0) - coalesce(a.actual_amount,0) as variance_amount,
    case when coalesce(b.budget_amount,0) > 0
      then round((coalesce(a.actual_amount,0)-coalesce(b.budget_amount,0))/b.budget_amount*100,2) else null end as variance_pct
  from public.trace_opex_categories c
  left join public.trace_opex_budgets b on b.opex_category_id=c.id and b.period=p_period
    and b.organization_id=trim(p_client_id) and (p_outlet_id is null or b.outlet_id is not distinct from p_outlet_id)
  left join (
    select opex_category_id, sum(amount) as actual_amount
    from public.trace_opex_line_items
    where organization_id=trim(p_client_id) and is_template=false and period=p_period
      and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id)
    group by opex_category_id
  ) a on a.opex_category_id=c.id
  where public.trace_is_team_member() and c.organization_id=trim(p_client_id)
  order by c.name asc;
$$;
revoke all on function public.trace_opex_budget_vs_actual(text,text,text) from public;
grant execute on function public.trace_opex_budget_vs_actual(text,text,text) to authenticated;

-- ============================================================
-- 6. RPC — posting periode OPEX: roll-up ke finance_records + jurnal
-- ============================================================
create or replace function public.trace_post_opex_period(
  p_client_id text,p_outlet_id text,p_period text,
  p_opex_expense_account_id uuid,p_cash_bank_account_id uuid,p_ap_payable_account_id uuid,
  p_entry_date date default current_date
) returns table(total_amount numeric, total_paid numeric, total_unpaid numeric, journal_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  v_total numeric; v_paid numeric; v_unpaid numeric;
  v_existing_finance_id uuid; v_existing_version bigint;
  v_lines jsonb; v_journal_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPEX_ACTOR_FORBIDDEN'; end if;

  select coalesce(sum(amount),0), coalesce(sum(paid_amount),0)
    into v_total, v_paid
  from public.trace_opex_line_items
  where organization_id=trim(p_client_id) and is_template=false and period=p_period
    and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id);
  v_unpaid := v_total - v_paid;

  select id, version into v_existing_finance_id, v_existing_version
  from public.trace_finance_records
  where client_id=trim(p_client_id) and outlet_id is not distinct from p_outlet_id
    and period=p_period and category='opex';

  perform public.trace_upsert_finance_record(
    v_existing_finance_id, trim(p_client_id), p_outlet_id, p_period, 'opex',
    v_total, 'system', 'Auto dari OPEX detail '||p_period, v_existing_version, 'opex_posting');

  if v_total > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',p_opex_expense_account_id,'debit',v_total,'credit',0,'memo','Beban OPEX '||p_period)
    );
    if v_paid > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id',p_cash_bank_account_id,'debit',0,'credit',v_paid,'memo','Pembayaran OPEX (kas/bank) '||p_period));
    end if;
    if v_unpaid > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id',p_ap_payable_account_id,'debit',0,'credit',v_unpaid,'memo','Hutang OPEX belum dibayar '||p_period));
    end if;
    select public.trace_post_balanced_journal(
      trim(p_client_id), p_entry_date, 'opex_period', p_period,
      'OPEX '||p_period, 'adjustment', v_lines
    ) into v_journal_id;
  end if;

  return query select v_total, v_paid, v_unpaid, v_journal_id;
end; $$;
revoke all on function public.trace_post_opex_period(text,text,text,uuid,uuid,uuid,date) from public;
grant execute on function public.trace_post_opex_period(text,text,text,uuid,uuid,uuid,date) to authenticated;
