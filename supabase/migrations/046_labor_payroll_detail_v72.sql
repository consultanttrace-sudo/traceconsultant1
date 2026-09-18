-- v72.14 — Labor/OPEX detail module, Tahap A/2: Labor (payroll) detail.
-- Roll-up ke trace_finance_records (category='labor') via
-- trace_upsert_finance_record yang sudah ada (022), dan opsional posting
-- jurnal via trace_post_balanced_journal (028) — bukan jalur akuntansi
-- paralel. Scoping organization/client_id text, konsisten dgn modul lain.

-- ============================================================
-- 1. MASTER KARYAWAN
-- ============================================================
create table if not exists public.trace_employees (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  employee_code text,
  name text not null,
  position text,
  employment_type text not null default 'tetap'
    check (employment_type in ('tetap','kontrak','harian','lepas','magang')),
  base_salary numeric not null default 0,
  hourly_rate numeric not null default 0,
  bank_name text,
  bank_account text,
  npwp text,
  bpjs_kesehatan_no text,
  bpjs_ketenagakerjaan_no text,
  join_date date,
  resign_date date,
  status text not null default 'active' check (status in ('active','resigned','on_leave')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, employee_code)
);
create index if not exists trace_employees_scope_idx on public.trace_employees(organization_id, outlet_id, status);
alter table public.trace_employees enable row level security;
revoke all on public.trace_employees from anon, authenticated;
grant select on public.trace_employees to authenticated;
drop policy if exists trace_employees_team_select on public.trace_employees;
create policy trace_employees_team_select on public.trace_employees
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_create_employee(
  p_client_id text,p_outlet_id text,p_employee_code text,p_name text,p_position text,
  p_employment_type text,p_base_salary numeric,p_hourly_rate numeric,p_bank_name text,
  p_bank_account text,p_npwp text,p_bpjs_kesehatan_no text,p_bpjs_ketenagakerjaan_no text,p_join_date date)
returns public.trace_employees
language plpgsql security definer set search_path=public as $$
declare v public.trace_employees;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_EMP_ACTOR_FORBIDDEN'; end if;
  if p_client_id is null or length(trim(p_client_id))=0 then raise exception 'TRACE_EMP_ORG_REQUIRED'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'TRACE_EMP_NAME_REQUIRED'; end if;
  insert into public.trace_employees(
    organization_id,outlet_id,employee_code,name,position,employment_type,base_salary,hourly_rate,
    bank_name,bank_account,npwp,bpjs_kesehatan_no,bpjs_ketenagakerjaan_no,join_date,created_by)
  values(
    trim(p_client_id),nullif(trim(p_outlet_id),''),nullif(trim(p_employee_code),''),trim(p_name),
    nullif(trim(p_position),''),coalesce(nullif(trim(p_employment_type),''),'tetap'),coalesce(p_base_salary,0),
    coalesce(p_hourly_rate,0),nullif(trim(p_bank_name),''),nullif(trim(p_bank_account),''),
    nullif(trim(p_npwp),''),nullif(trim(p_bpjs_kesehatan_no),''),nullif(trim(p_bpjs_ketenagakerjaan_no),''),
    p_join_date,auth.uid())
  returning * into v;
  perform public.trace_append_audit_event('create','employee',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_create_employee(text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,date) from public;
grant execute on function public.trace_create_employee(text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,date) to authenticated;

create or replace function public.trace_list_employees(p_client_id text,p_outlet_id text default null,p_status text default 'active')
returns setof public.trace_employees
language sql stable security definer set search_path=public as $$
  select * from public.trace_employees
  where public.trace_is_team_member()
    and organization_id = trim(p_client_id)
    and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id)
    and (p_status is null or status = p_status)
  order by name asc;
$$;
revoke all on function public.trace_list_employees(text,text,text) from public;
grant execute on function public.trace_list_employees(text,text,text) to authenticated;

-- ============================================================
-- 2. PAYROLL RUN (per periode, state machine + optimistic lock)
-- ============================================================
create table if not exists public.trace_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'draft'
    check (status in ('draft','reviewing','approved','posted','cancelled')),
  version bigint not null default 1,
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  posted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, outlet_id, period)
);
alter table public.trace_payroll_runs enable row level security;
revoke all on public.trace_payroll_runs from anon, authenticated;
grant select on public.trace_payroll_runs to authenticated;
drop policy if exists trace_payroll_runs_team_select on public.trace_payroll_runs;
create policy trace_payroll_runs_team_select on public.trace_payroll_runs
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_payroll_run_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if new.version <> old.version + 1 then raise exception 'TRACE_PAYROLL_VERSION_MISMATCH'; end if;
    if new.status is distinct from old.status and not (
      (old.status='draft' and new.status in ('reviewing','cancelled')) or
      (old.status='reviewing' and new.status in ('draft','approved','cancelled')) or
      (old.status='approved' and new.status in ('posted','cancelled')) or
      (old.status='posted' and new.status='posted') or
      (old.status='cancelled' and new.status='cancelled')
    ) then raise exception 'TRACE_PAYROLL_INVALID_TRANSITION:%:%',old.status,new.status; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trace_payroll_run_guard on public.trace_payroll_runs;
create trigger trg_trace_payroll_run_guard
  before update on public.trace_payroll_runs
  for each row execute function public.trace_payroll_run_guard();

-- ============================================================
-- 3. PAYROLL LINES — komponen lengkap per karyawan per periode
-- ============================================================
create table if not exists public.trace_payroll_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.trace_payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.trace_employees(id) on delete restrict,
  days_worked numeric not null default 0,
  overtime_hours numeric not null default 0,
  overtime_rate_multiplier numeric not null default 1.5,
  base_pay numeric not null default 0,
  overtime_pay numeric not null default 0,
  allowance_transport numeric not null default 0,
  allowance_meal numeric not null default 0,
  allowance_other numeric not null default 0,
  thr_amount numeric not null default 0,
  bonus_amount numeric not null default 0,
  bpjs_kesehatan_employee numeric not null default 0,
  bpjs_kesehatan_employer numeric not null default 0,
  bpjs_jht_employee numeric not null default 0,
  bpjs_jht_employer numeric not null default 0,
  bpjs_jkk_employer numeric not null default 0,
  bpjs_jkm_employer numeric not null default 0,
  bpjs_jp_employee numeric not null default 0,
  bpjs_jp_employer numeric not null default 0,
  pph21_amount numeric not null default 0,
  other_deductions numeric not null default 0,
  deduction_notes text,
  gross_pay numeric not null default 0,
  total_deductions numeric not null default 0,
  net_pay numeric not null default 0,
  employer_cost_total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payroll_run_id, employee_id)
);
alter table public.trace_payroll_lines enable row level security;
revoke all on public.trace_payroll_lines from anon, authenticated;
grant select on public.trace_payroll_lines to authenticated;
drop policy if exists trace_payroll_lines_team_select on public.trace_payroll_lines;
create policy trace_payroll_lines_team_select on public.trace_payroll_lines
for select to authenticated using (public.trace_is_team_member());

-- ============================================================
-- 4. RPC — buka payroll run + tambah/hitung baris per karyawan
-- ============================================================
create or replace function public.trace_open_payroll_run(p_client_id text,p_outlet_id text,p_period text,p_notes text)
returns public.trace_payroll_runs
language plpgsql security definer set search_path=public as $$
declare v public.trace_payroll_runs;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_PAYROLL_ACTOR_FORBIDDEN'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'TRACE_PAYROLL_PERIOD_INVALID'; end if;
  insert into public.trace_payroll_runs(organization_id,outlet_id,period,opened_by,notes)
  values(trim(p_client_id),p_outlet_id,p_period,auth.uid(),nullif(trim(p_notes),''))
  returning * into v;
  perform public.trace_append_audit_event('open','payroll_run',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_open_payroll_run(text,text,text,text) from public;
grant execute on function public.trace_open_payroll_run(text,text,text,text) to authenticated;

-- Upsert baris payroll per karyawan. Perhitungan gross/deduction/net
-- dilakukan di server (bukan dipercayakan ke client) supaya konsisten.
create or replace function public.trace_upsert_payroll_line(
  p_payroll_run_id uuid,p_employee_id uuid,p_days_worked numeric,p_overtime_hours numeric,
  p_overtime_rate_multiplier numeric,p_allowance_transport numeric,p_allowance_meal numeric,
  p_allowance_other numeric,p_thr_amount numeric,p_bonus_amount numeric,
  p_bpjs_kesehatan_employee numeric,p_bpjs_kesehatan_employer numeric,
  p_bpjs_jht_employee numeric,p_bpjs_jht_employer numeric,
  p_bpjs_jkk_employer numeric,p_bpjs_jkm_employer numeric,
  p_bpjs_jp_employee numeric,p_bpjs_jp_employer numeric,
  p_pph21_amount numeric,p_other_deductions numeric,p_deduction_notes text)
returns public.trace_payroll_lines
language plpgsql security definer set search_path=public as $$
declare
  v public.trace_payroll_lines;
  v_status text;
  v_emp public.trace_employees;
  v_base_pay numeric; v_ot_pay numeric; v_gross numeric; v_ded numeric; v_net numeric; v_employer_cost numeric;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_PAYROLL_ACTOR_FORBIDDEN'; end if;
  select status into v_status from public.trace_payroll_runs where id=p_payroll_run_id;
  if v_status is null then raise exception 'TRACE_PAYROLL_RUN_NOT_FOUND'; end if;
  if v_status not in ('draft','reviewing') then raise exception 'TRACE_PAYROLL_RUN_NOT_EDITABLE'; end if;

  select * into v_emp from public.trace_employees where id=p_employee_id;
  if not found then raise exception 'TRACE_PAYROLL_EMPLOYEE_NOT_FOUND'; end if;

  v_base_pay := case when v_emp.employment_type='harian'
    then v_emp.hourly_rate * 8 * coalesce(p_days_worked,0)
    else v_emp.base_salary end;
  v_ot_pay := coalesce(p_overtime_hours,0) * v_emp.hourly_rate * coalesce(p_overtime_rate_multiplier,1.5);

  v_gross := v_base_pay + v_ot_pay + coalesce(p_allowance_transport,0) + coalesce(p_allowance_meal,0)
    + coalesce(p_allowance_other,0) + coalesce(p_thr_amount,0) + coalesce(p_bonus_amount,0);

  v_ded := coalesce(p_bpjs_kesehatan_employee,0) + coalesce(p_bpjs_jht_employee,0)
    + coalesce(p_bpjs_jp_employee,0) + coalesce(p_pph21_amount,0) + coalesce(p_other_deductions,0);

  v_net := v_gross - v_ded;

  v_employer_cost := v_gross
    + coalesce(p_bpjs_kesehatan_employer,0) + coalesce(p_bpjs_jht_employer,0)
    + coalesce(p_bpjs_jkk_employer,0) + coalesce(p_bpjs_jkm_employer,0) + coalesce(p_bpjs_jp_employer,0);

  insert into public.trace_payroll_lines(
    payroll_run_id,employee_id,days_worked,overtime_hours,overtime_rate_multiplier,base_pay,overtime_pay,
    allowance_transport,allowance_meal,allowance_other,thr_amount,bonus_amount,
    bpjs_kesehatan_employee,bpjs_kesehatan_employer,bpjs_jht_employee,bpjs_jht_employer,
    bpjs_jkk_employer,bpjs_jkm_employer,bpjs_jp_employee,bpjs_jp_employer,
    pph21_amount,other_deductions,deduction_notes,gross_pay,total_deductions,net_pay,employer_cost_total)
  values(
    p_payroll_run_id,p_employee_id,coalesce(p_days_worked,0),coalesce(p_overtime_hours,0),
    coalesce(p_overtime_rate_multiplier,1.5),v_base_pay,v_ot_pay,
    coalesce(p_allowance_transport,0),coalesce(p_allowance_meal,0),coalesce(p_allowance_other,0),
    coalesce(p_thr_amount,0),coalesce(p_bonus_amount,0),
    coalesce(p_bpjs_kesehatan_employee,0),coalesce(p_bpjs_kesehatan_employer,0),
    coalesce(p_bpjs_jht_employee,0),coalesce(p_bpjs_jht_employer,0),
    coalesce(p_bpjs_jkk_employer,0),coalesce(p_bpjs_jkm_employer,0),
    coalesce(p_bpjs_jp_employee,0),coalesce(p_bpjs_jp_employer,0),
    coalesce(p_pph21_amount,0),coalesce(p_other_deductions,0),nullif(trim(p_deduction_notes),''),
    v_gross,v_ded,v_net,v_employer_cost)
  on conflict(payroll_run_id,employee_id) do update set
    days_worked=excluded.days_worked, overtime_hours=excluded.overtime_hours,
    overtime_rate_multiplier=excluded.overtime_rate_multiplier, base_pay=excluded.base_pay,
    overtime_pay=excluded.overtime_pay, allowance_transport=excluded.allowance_transport,
    allowance_meal=excluded.allowance_meal, allowance_other=excluded.allowance_other,
    thr_amount=excluded.thr_amount, bonus_amount=excluded.bonus_amount,
    bpjs_kesehatan_employee=excluded.bpjs_kesehatan_employee, bpjs_kesehatan_employer=excluded.bpjs_kesehatan_employer,
    bpjs_jht_employee=excluded.bpjs_jht_employee, bpjs_jht_employer=excluded.bpjs_jht_employer,
    bpjs_jkk_employer=excluded.bpjs_jkk_employer, bpjs_jkm_employer=excluded.bpjs_jkm_employer,
    bpjs_jp_employee=excluded.bpjs_jp_employee, bpjs_jp_employer=excluded.bpjs_jp_employer,
    pph21_amount=excluded.pph21_amount, other_deductions=excluded.other_deductions,
    deduction_notes=excluded.deduction_notes, gross_pay=excluded.gross_pay,
    total_deductions=excluded.total_deductions, net_pay=excluded.net_pay,
    employer_cost_total=excluded.employer_cost_total, updated_at=now()
  returning * into v;

  perform public.trace_append_audit_event('upsert','payroll_line',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_upsert_payroll_line(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from public;
grant execute on function public.trace_upsert_payroll_line(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;

create or replace function public.trace_get_payroll_lines(p_payroll_run_id uuid)
returns setof public.trace_payroll_lines
language sql stable security definer set search_path=public as $$
  select * from public.trace_payroll_lines
  where payroll_run_id=p_payroll_run_id and public.trace_is_team_member()
  order by updated_at desc;
$$;
revoke all on function public.trace_get_payroll_lines(uuid) from public;
grant execute on function public.trace_get_payroll_lines(uuid) to authenticated;

-- ============================================================
-- 5. RPC — transisi status payroll run (atomik)
-- ============================================================
create or replace function public.trace_transition_payroll_run(
  p_payroll_run_id uuid,p_status text,p_expected_version bigint,p_reason text default null)
returns public.trace_payroll_runs
language plpgsql security definer set search_path=public as $$
declare r public.trace_payroll_runs; v_empty int;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_PAYROLL_ACTOR_FORBIDDEN'; end if;
  select * into r from public.trace_payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'TRACE_PAYROLL_RUN_NOT_FOUND'; end if;
  if r.version <> p_expected_version then raise exception 'TRACE_PAYROLL_VERSION_MISMATCH'; end if;

  if p_status='reviewing' then
    select count(*) into v_empty from public.trace_payroll_lines where payroll_run_id=p_payroll_run_id;
    if v_empty = 0 then raise exception 'TRACE_PAYROLL_NO_LINES'; end if;
  end if;

  update public.trace_payroll_runs
  set status=p_status, version=version+1,
      approved_by=case when p_status='approved' then auth.uid() else approved_by end,
      approved_at=case when p_status='approved' then now() else approved_at end,
      updated_at=now()
  where id=p_payroll_run_id and version=p_expected_version
  returning * into r;
  if not found then raise exception 'TRACE_PAYROLL_CONCURRENT_UPDATE'; end if;

  perform public.trace_append_audit_event('transition','payroll_run',r.id::text,
    jsonb_build_object('version',p_expected_version), jsonb_build_object('status',r.status,'version',r.version), p_reason);
  return r;
end; $$;
revoke all on function public.trace_transition_payroll_run(uuid,text,bigint,text) from public;
grant execute on function public.trace_transition_payroll_run(uuid,text,bigint,text) to authenticated;

-- ============================================================
-- 6. RPC — posting payroll run (approved -> posted): roll-up ke
--    trace_finance_records(category='labor') + jurnal double-entry
-- ============================================================
create or replace function public.trace_post_payroll_run(
  p_payroll_run_id uuid,p_expected_version bigint,
  p_labor_expense_account_id uuid,p_bpjs_payable_account_id uuid,
  p_tax_payable_account_id uuid,p_cash_bank_account_id uuid,
  p_entry_date date default current_date
) returns public.trace_payroll_runs
language plpgsql security definer set search_path=public as $$
declare
  r public.trace_payroll_runs;
  v_total_employer_cost numeric := 0;
  v_total_net_pay numeric := 0;
  v_total_bpjs_payable numeric := 0;
  v_total_tax_payable numeric := 0;
  v_existing_finance_id uuid; v_existing_version bigint;
  v_lines jsonb;
  v_journal_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_PAYROLL_ACTOR_FORBIDDEN'; end if;
  select * into r from public.trace_payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'TRACE_PAYROLL_RUN_NOT_FOUND'; end if;
  if r.status <> 'approved' then raise exception 'TRACE_PAYROLL_RUN_NOT_APPROVED'; end if;
  if r.version <> p_expected_version then raise exception 'TRACE_PAYROLL_VERSION_MISMATCH'; end if;

  select
    coalesce(sum(employer_cost_total),0), coalesce(sum(net_pay),0),
    coalesce(sum(bpjs_kesehatan_employee+bpjs_kesehatan_employer+bpjs_jht_employee+bpjs_jht_employer
      +bpjs_jkk_employer+bpjs_jkm_employer+bpjs_jp_employee+bpjs_jp_employer),0),
    coalesce(sum(pph21_amount),0)
  into v_total_employer_cost, v_total_net_pay, v_total_bpjs_payable, v_total_tax_payable
  from public.trace_payroll_lines where payroll_run_id=p_payroll_run_id;

  -- roll-up ke ringkasan P&L (dipakai finance.ts) — upsert idempoten per periode
  select id, version into v_existing_finance_id, v_existing_version
  from public.trace_finance_records
  where client_id=r.organization_id and outlet_id is not distinct from r.outlet_id
    and period=r.period and category='labor';

  perform public.trace_upsert_finance_record(
    v_existing_finance_id, r.organization_id, r.outlet_id, r.period, 'labor',
    v_total_employer_cost, 'system', 'Auto dari payroll run '||r.period, v_existing_version, 'payroll_posting');

  -- jurnal double-entry: debit labor expense (total biaya termasuk porsi
  -- perusahaan), kredit hutang BPJS, hutang pajak, dan kas/bank utk net pay
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id',p_labor_expense_account_id,'debit',v_total_employer_cost,'credit',0,'memo','Beban gaji & tunjangan '||r.period)
  );
  if v_total_bpjs_payable > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id',p_bpjs_payable_account_id,'debit',0,'credit',v_total_bpjs_payable,'memo','Hutang BPJS '||r.period));
  end if;
  if v_total_tax_payable > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id',p_tax_payable_account_id,'debit',0,'credit',v_total_tax_payable,'memo','Hutang PPh 21 '||r.period));
  end if;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id',p_cash_bank_account_id,'debit',0,'credit',v_total_net_pay,'memo','Pembayaran gaji bersih '||r.period));

  select public.trace_post_balanced_journal(
    r.organization_id, p_entry_date, 'payroll_run', r.id::text,
    'Payroll '||r.period, 'adjustment', v_lines
  ) into v_journal_id;

  update public.trace_payroll_runs
  set status='posted', version=version+1, posted_at=now(), updated_at=now()
  where id=p_payroll_run_id and version=p_expected_version
  returning * into r;
  if not found then raise exception 'TRACE_PAYROLL_CONCURRENT_UPDATE'; end if;

  perform public.trace_append_audit_event('post','payroll_run',r.id::text,null,
    jsonb_build_object('journal_id',v_journal_id,'total_employer_cost',v_total_employer_cost,'total_net_pay',v_total_net_pay),null);
  return r;
end; $$;
revoke all on function public.trace_post_payroll_run(uuid,bigint,uuid,uuid,uuid,uuid,date) from public;
grant execute on function public.trace_post_payroll_run(uuid,bigint,uuid,uuid,uuid,uuid,date) to authenticated;

create or replace function public.trace_list_payroll_runs(p_client_id text,p_outlet_id text default null)
returns setof public.trace_payroll_runs
language sql stable security definer set search_path=public as $$
  select * from public.trace_payroll_runs
  where public.trace_is_team_member()
    and organization_id = trim(p_client_id)
    and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id)
  order by period desc;
$$;
revoke all on function public.trace_list_payroll_runs(text,text) from public;
grant execute on function public.trace_list_payroll_runs(text,text) to authenticated;
