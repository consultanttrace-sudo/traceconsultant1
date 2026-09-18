-- v72.15 — Marketing/Content/KPI/SOP/Action Plan, Tahap 1/4: KPI tracking.
-- Menggantikan legacy trace_kv keys 'trace_os::trace-kpi-individu' dan
-- 'trace_os::trace-kpi-indikator-def' (lihat 031_trace_kv_access_boundary_v72.sql)
-- dengan tabel relasional + RPC, konsisten dengan modul lain.
--
-- Desain sengaja menyimpan field mentah yang cocok dengan
-- src/core/kpi.ts (KPIInput/KPIResult) — perhitungan change/changePct/
-- targetGap TETAP dilakukan oleh calculateKPI() di TypeScript (satu-
-- satunya sumber logika), bukan diduplikasi di SQL. Tabel ini hanya
-- persistence layer.

-- ============================================================
-- 1. DEFINISI INDIKATOR KPI (master, per organisasi)
-- ============================================================
create table if not exists public.trace_kpi_indicators (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  name text not null,
  unit text not null check (unit in ('number','currency','percent')),
  category text,
  formula_description text,
  default_target numeric,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);
alter table public.trace_kpi_indicators enable row level security;
revoke all on public.trace_kpi_indicators from anon, authenticated;
grant select on public.trace_kpi_indicators to authenticated;
drop policy if exists trace_kpi_indicators_team_select on public.trace_kpi_indicators;
create policy trace_kpi_indicators_team_select on public.trace_kpi_indicators
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_create_kpi_indicator(
  p_client_id text,p_name text,p_unit text,p_category text,p_formula_description text,p_default_target numeric)
returns public.trace_kpi_indicators
language plpgsql security definer set search_path=public as $$
declare v public.trace_kpi_indicators;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_KPI_ACTOR_FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'TRACE_KPI_NAME_REQUIRED'; end if;
  if p_unit not in ('number','currency','percent') then raise exception 'TRACE_KPI_UNIT_INVALID'; end if;
  insert into public.trace_kpi_indicators(organization_id,name,unit,category,formula_description,default_target,created_by)
  values(trim(p_client_id),trim(p_name),p_unit,nullif(trim(p_category),''),nullif(trim(p_formula_description),''),p_default_target,auth.uid())
  returning * into v;
  return v;
end; $$;
revoke all on function public.trace_create_kpi_indicator(text,text,text,text,text,numeric) from public;
grant execute on function public.trace_create_kpi_indicator(text,text,text,text,text,numeric) to authenticated;

create or replace function public.trace_list_kpi_indicators(p_client_id text)
returns setof public.trace_kpi_indicators
language sql stable security definer set search_path=public as $$
  select * from public.trace_kpi_indicators
  where public.trace_is_team_member() and organization_id=trim(p_client_id) and is_active
  order by category asc nulls last, name asc;
$$;
revoke all on function public.trace_list_kpi_indicators(text) from public;
grant execute on function public.trace_list_kpi_indicators(text) to authenticated;

-- ============================================================
-- 2. NILAI KPI — generik: bisa per individu (employee_id) ATAU per
--    organisasi/outlet secara keseluruhan (subject_type membedakan)
-- ============================================================
create table if not exists public.trace_kpi_values (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  indicator_id uuid not null references public.trace_kpi_indicators(id) on delete restrict,
  subject_type text not null default 'organization' check (subject_type in ('organization','outlet','employee')),
  employee_id uuid references public.trace_employees(id) on delete set null,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  current_value numeric,
  previous_value numeric,
  target_value numeric,
  status text not null default 'manual' check (status in ('available','unavailable','manual')),
  evidence jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_type <> 'employee' or employee_id is not null),
  unique(organization_id, outlet_id, indicator_id, subject_type, employee_id, period)
);
create index if not exists trace_kpi_values_scope_idx
  on public.trace_kpi_values(organization_id, period, subject_type);
alter table public.trace_kpi_values enable row level security;
revoke all on public.trace_kpi_values from anon, authenticated;
grant select on public.trace_kpi_values to authenticated;
drop policy if exists trace_kpi_values_team_select on public.trace_kpi_values;
create policy trace_kpi_values_team_select on public.trace_kpi_values
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_upsert_kpi_value(
  p_client_id text,p_outlet_id text,p_indicator_id uuid,p_subject_type text,p_employee_id uuid,
  p_period text,p_current_value numeric,p_previous_value numeric,p_target_value numeric,
  p_status text,p_evidence jsonb,p_notes text)
returns public.trace_kpi_values
language plpgsql security definer set search_path=public as $$
declare v public.trace_kpi_values;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_KPI_ACTOR_FORBIDDEN'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'TRACE_KPI_PERIOD_INVALID'; end if;
  if p_subject_type not in ('organization','outlet','employee') then raise exception 'TRACE_KPI_SUBJECT_TYPE_INVALID'; end if;
  if p_subject_type='employee' and p_employee_id is null then raise exception 'TRACE_KPI_EMPLOYEE_REQUIRED'; end if;

  insert into public.trace_kpi_values(
    organization_id,outlet_id,indicator_id,subject_type,employee_id,period,
    current_value,previous_value,target_value,status,evidence,notes,created_by)
  values(
    trim(p_client_id),p_outlet_id,p_indicator_id,p_subject_type,p_employee_id,p_period,
    p_current_value,p_previous_value,p_target_value,coalesce(nullif(trim(p_status),''),'manual'),
    coalesce(p_evidence,'[]'::jsonb),nullif(trim(p_notes),''),auth.uid())
  on conflict(organization_id,outlet_id,indicator_id,subject_type,employee_id,period)
  do update set
    current_value=excluded.current_value, previous_value=excluded.previous_value,
    target_value=excluded.target_value, status=excluded.status,
    evidence=excluded.evidence, notes=excluded.notes, updated_at=now()
  returning * into v;

  perform public.trace_append_audit_event('upsert','kpi_value',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_upsert_kpi_value(text,text,uuid,text,uuid,text,numeric,numeric,numeric,text,jsonb,text) from public;
grant execute on function public.trace_upsert_kpi_value(text,text,uuid,text,uuid,text,numeric,numeric,numeric,text,jsonb,text) to authenticated;

-- Bentuk hasil query sudah sesuai field KPIInput (src/core/kpi.ts) agar
-- front-end tinggal map lalu panggil calculateKPI()/calculateKPIs().
create or replace function public.trace_list_kpi_values(
  p_client_id text,p_period text,p_subject_type text default null,p_employee_id uuid default null,p_outlet_id text default null)
returns table(
  id uuid, indicator_id uuid, indicator_name text, unit text, subject_type text, employee_id uuid,
  period text, current_value numeric, previous_value numeric, target_value numeric, status text, evidence jsonb, notes text
)
language sql stable security definer set search_path=public as $$
  select v.id, v.indicator_id, i.name, i.unit, v.subject_type, v.employee_id, v.period,
    v.current_value, v.previous_value, v.target_value, v.status, v.evidence, v.notes
  from public.trace_kpi_values v
  join public.trace_kpi_indicators i on i.id = v.indicator_id
  where public.trace_is_team_member()
    and v.organization_id = trim(p_client_id)
    and v.period = p_period
    and (p_subject_type is null or v.subject_type = p_subject_type)
    and (p_employee_id is null or v.employee_id = p_employee_id)
    and (p_outlet_id is null or v.outlet_id is not distinct from p_outlet_id)
  order by i.category asc nulls last, i.name asc;
$$;
revoke all on function public.trace_list_kpi_values(text,text,text,uuid,text) from public;
grant execute on function public.trace_list_kpi_values(text,text,text,uuid,text) to authenticated;

-- Tren nilai KPI lintas periode untuk satu indikator+subjek (grafik trend)
create or replace function public.trace_kpi_value_trend(
  p_client_id text,p_indicator_id uuid,p_subject_type text,p_employee_id uuid default null,p_limit int default 12)
returns table(period text, current_value numeric, target_value numeric)
language sql stable security definer set search_path=public as $$
  select period, current_value, target_value
  from public.trace_kpi_values
  where public.trace_is_team_member()
    and organization_id=trim(p_client_id) and indicator_id=p_indicator_id
    and subject_type=p_subject_type and employee_id is not distinct from p_employee_id
  order by period desc
  limit p_limit;
$$;
revoke all on function public.trace_kpi_value_trend(text,uuid,text,uuid,int) from public;
grant execute on function public.trace_kpi_value_trend(text,uuid,text,uuid,int) to authenticated;
