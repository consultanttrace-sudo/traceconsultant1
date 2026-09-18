-- v72.13 — Inventory module, Tahap 2/3 (REVISI, mengikuti 043 revisi).
-- Scoping organization_id/outlet_id (text), bukan location_id uuid, agar
-- konsisten dengan trace_inventory_items/trace_inventory_movements (024)
-- dan trace_inventory_stock_lots/trace_inventory_ledger (043 revisi).
-- State machine + optimistic locking mengikuti pola
-- 012_trace_task_atomic_transition.sql.

-- ============================================================
-- 1. OPNAME SESSIONS
-- ============================================================
create table if not exists public.trace_inventory_opname_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  period_label text not null,
  status text not null default 'counting'
    check (status in ('counting','reviewing','approved','posted','cancelled')),
  version bigint not null default 1,
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  posted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trace_inv_opname_sessions_scope_idx
  on public.trace_inventory_opname_sessions(organization_id, outlet_id, status);
alter table public.trace_inventory_opname_sessions enable row level security;
revoke all on public.trace_inventory_opname_sessions from anon, authenticated;
grant select on public.trace_inventory_opname_sessions to authenticated;
drop policy if exists trace_inv_opname_sessions_team_select on public.trace_inventory_opname_sessions;
create policy trace_inv_opname_sessions_team_select on public.trace_inventory_opname_sessions
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_inventory_opname_session_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if new.version <> old.version + 1 then raise exception 'TRACE_OPNAME_VERSION_MISMATCH'; end if;
    if new.status is distinct from old.status and not (
      (old.status='counting' and new.status in ('reviewing','cancelled')) or
      (old.status='reviewing' and new.status in ('counting','approved','cancelled')) or
      (old.status='approved' and new.status in ('posted','cancelled')) or
      (old.status='posted' and new.status='posted') or
      (old.status='cancelled' and new.status='cancelled')
    ) then raise exception 'TRACE_OPNAME_INVALID_TRANSITION:%:%',old.status,new.status; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trace_inv_opname_session_guard on public.trace_inventory_opname_sessions;
create trigger trg_trace_inv_opname_session_guard
  before update on public.trace_inventory_opname_sessions
  for each row execute function public.trace_inventory_opname_session_guard();

-- ============================================================
-- 2. OPNAME LINES (per item, snapshot expected vs counted)
-- ============================================================
create table if not exists public.trace_inventory_opname_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trace_inventory_opname_sessions(id) on delete cascade,
  item_id uuid not null references public.trace_inventory_items(id) on delete restrict,
  expected_qty numeric not null default 0,
  expected_unit_cost numeric not null default 0,
  expected_value numeric not null default 0,
  counted_qty numeric,
  counted_by uuid references auth.users(id) on delete set null,
  counted_at timestamptz,
  secondary_counted_qty numeric,
  secondary_counted_by uuid references auth.users(id) on delete set null,
  secondary_counted_at timestamptz,
  variance_qty numeric,
  variance_value numeric,
  variance_reason text,
  variance_reason_code text
    check (variance_reason_code is null or variance_reason_code in
      ('damaged','lost','expired','input_error','theft_suspected','uom_mismatch','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, item_id)
);
alter table public.trace_inventory_opname_lines enable row level security;
revoke all on public.trace_inventory_opname_lines from anon, authenticated;
grant select on public.trace_inventory_opname_lines to authenticated;
drop policy if exists trace_inv_opname_lines_team_select on public.trace_inventory_opname_lines;
create policy trace_inv_opname_lines_team_select on public.trace_inventory_opname_lines
for select to authenticated using (public.trace_is_team_member());

-- ============================================================
-- 3. RPC — buka sesi opname: snapshot posisi stok saat ini sebagai "expected"
-- ============================================================
create or replace function public.trace_open_opname_session(p_client_id text,p_outlet_id text,p_period_label text,p_notes text)
returns public.trace_inventory_opname_sessions
language plpgsql security definer set search_path=public as $$
declare v public.trace_inventory_opname_sessions;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPNAME_ACTOR_FORBIDDEN'; end if;
  if p_client_id is null or length(trim(p_client_id))=0 then raise exception 'TRACE_OPNAME_ORG_REQUIRED'; end if;
  if p_period_label is null or length(trim(p_period_label))=0 then raise exception 'TRACE_OPNAME_PERIOD_REQUIRED'; end if;
  if exists (
    select 1 from public.trace_inventory_opname_sessions
    where organization_id=trim(p_client_id) and outlet_id is not distinct from p_outlet_id
      and status in ('counting','reviewing','approved')
  ) then raise exception 'TRACE_OPNAME_SESSION_ALREADY_OPEN_FOR_SCOPE'; end if;

  insert into public.trace_inventory_opname_sessions(organization_id,outlet_id,period_label,opened_by,notes)
  values(trim(p_client_id),p_outlet_id,trim(p_period_label),auth.uid(),nullif(trim(p_notes),''))
  returning * into v;

  insert into public.trace_inventory_opname_lines(session_id,item_id,expected_qty,expected_unit_cost,expected_value)
  select v.id, pos.item_id, pos.qty_on_hand, pos.avg_unit_cost, pos.value_on_hand
  from public.trace_inventory_position(trim(p_client_id), p_outlet_id) pos
  where pos.qty_on_hand <> 0 or exists (
    select 1 from public.trace_inventory_items i where i.id=pos.item_id and i.active
  );

  perform public.trace_append_audit_event('open','inventory_opname_session',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_open_opname_session(text,text,text,text) from public;
grant execute on function public.trace_open_opname_session(text,text,text,text) to authenticated;

-- ============================================================
-- 4. RPC — input hitung fisik (primary & secondary/dual count)
-- ============================================================
create or replace function public.trace_submit_opname_count(
  p_session_id uuid,p_item_id uuid,p_counted_qty numeric,p_is_secondary boolean default false)
returns public.trace_inventory_opname_lines
language plpgsql security definer set search_path=public as $$
declare v public.trace_inventory_opname_lines; v_status text;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPNAME_ACTOR_FORBIDDEN'; end if;
  if p_counted_qty is null or p_counted_qty < 0 then raise exception 'TRACE_OPNAME_COUNT_INVALID'; end if;

  select status into v_status from public.trace_inventory_opname_sessions where id=p_session_id;
  if v_status is null then raise exception 'TRACE_OPNAME_SESSION_NOT_FOUND'; end if;
  if v_status not in ('counting','reviewing') then raise exception 'TRACE_OPNAME_SESSION_NOT_COUNTABLE'; end if;

  if p_is_secondary then
    update public.trace_inventory_opname_lines
    set secondary_counted_qty=p_counted_qty, secondary_counted_by=auth.uid(),
        secondary_counted_at=now(), updated_at=now()
    where session_id=p_session_id and item_id=p_item_id
    returning * into v;
  else
    update public.trace_inventory_opname_lines
    set counted_qty=p_counted_qty, counted_by=auth.uid(), counted_at=now(),
        variance_qty=p_counted_qty-expected_qty,
        variance_value=(p_counted_qty-expected_qty)*expected_unit_cost,
        updated_at=now()
    where session_id=p_session_id and item_id=p_item_id
    returning * into v;
  end if;

  if not found then raise exception 'TRACE_OPNAME_LINE_NOT_FOUND'; end if;
  perform public.trace_append_audit_event('count','inventory_opname_line',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_submit_opname_count(uuid,uuid,numeric,boolean) from public;
grant execute on function public.trace_submit_opname_count(uuid,uuid,numeric,boolean) to authenticated;

create or replace function public.trace_opname_count_discrepancies(p_session_id uuid, p_tolerance numeric default 0)
returns setof public.trace_inventory_opname_lines
language sql stable security definer set search_path=public as $$
  select * from public.trace_inventory_opname_lines
  where session_id=p_session_id
    and public.trace_is_team_member()
    and secondary_counted_qty is not null
    and abs(coalesce(counted_qty,0)-secondary_counted_qty) > p_tolerance;
$$;
revoke all on function public.trace_opname_count_discrepancies(uuid,numeric) from public;
grant execute on function public.trace_opname_count_discrepancies(uuid,numeric) to authenticated;

-- ============================================================
-- 5. RPC — isi alasan varians (wajib sebelum approve untuk baris bervarians)
-- ============================================================
create or replace function public.trace_set_opname_variance_reason(
  p_session_id uuid,p_item_id uuid,p_reason_code text,p_reason_note text)
returns public.trace_inventory_opname_lines
language plpgsql security definer set search_path=public as $$
declare v public.trace_inventory_opname_lines;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPNAME_ACTOR_FORBIDDEN'; end if;
  update public.trace_inventory_opname_lines
  set variance_reason_code=p_reason_code, variance_reason=nullif(trim(p_reason_note),''), updated_at=now()
  where session_id=p_session_id and item_id=p_item_id
  returning * into v;
  if not found then raise exception 'TRACE_OPNAME_LINE_NOT_FOUND'; end if;
  return v;
end; $$;
revoke all on function public.trace_set_opname_variance_reason(uuid,uuid,text,text) from public;
grant execute on function public.trace_set_opname_variance_reason(uuid,uuid,text,text) to authenticated;

-- ============================================================
-- 6. RPC — transisi status sesi (atomik, optimistic locking)
-- ============================================================
create or replace function public.trace_transition_opname_session(
  p_session_id uuid,p_status text,p_expected_version bigint,p_reason text default null)
returns public.trace_inventory_opname_sessions
language plpgsql security definer set search_path=public as $$
declare
  s public.trace_inventory_opname_sessions;
  v_uncounted int;
  v_missing_reason int;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPNAME_ACTOR_FORBIDDEN'; end if;
  select * into s from public.trace_inventory_opname_sessions where id=p_session_id for update;
  if not found then raise exception 'TRACE_OPNAME_SESSION_NOT_FOUND'; end if;
  if s.version <> p_expected_version then raise exception 'TRACE_OPNAME_VERSION_MISMATCH'; end if;

  if p_status='reviewing' then
    select count(*) into v_uncounted from public.trace_inventory_opname_lines
      where session_id=p_session_id and counted_qty is null;
    if v_uncounted > 0 then raise exception 'TRACE_OPNAME_UNCOUNTED_LINES_REMAIN:%',v_uncounted; end if;
  end if;

  if p_status='approved' then
    select count(*) into v_missing_reason from public.trace_inventory_opname_lines
      where session_id=p_session_id and coalesce(variance_qty,0) <> 0 and variance_reason_code is null;
    if v_missing_reason > 0 then raise exception 'TRACE_OPNAME_VARIANCE_REASON_REQUIRED:%',v_missing_reason; end if;
  end if;

  update public.trace_inventory_opname_sessions
  set status=p_status,
      version=version+1,
      approved_by=case when p_status='approved' then auth.uid() else approved_by end,
      approved_at=case when p_status='approved' then now() else approved_at end,
      updated_at=now()
  where id=p_session_id and version=p_expected_version
  returning * into s;
  if not found then raise exception 'TRACE_OPNAME_CONCURRENT_UPDATE'; end if;

  perform public.trace_append_audit_event('transition','inventory_opname_session',s.id::text,
    jsonb_build_object('status',p_expected_version), jsonb_build_object('status',s.status,'version',s.version), p_reason);
  return s;
end; $$;
revoke all on function public.trace_transition_opname_session(uuid,text,bigint,text) from public;
grant execute on function public.trace_transition_opname_session(uuid,text,bigint,text) to authenticated;

-- ============================================================
-- 7. RPC — baca sesi + baris (untuk layar UI)
-- ============================================================
create or replace function public.trace_list_opname_sessions(p_client_id text,p_outlet_id text default null)
returns setof public.trace_inventory_opname_sessions
language sql stable security definer set search_path=public as $$
  select * from public.trace_inventory_opname_sessions
  where public.trace_is_team_member()
    and organization_id = trim(p_client_id)
    and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id)
  order by opened_at desc;
$$;
revoke all on function public.trace_list_opname_sessions(text,text) from public;
grant execute on function public.trace_list_opname_sessions(text,text) to authenticated;

create or replace function public.trace_get_opname_lines(p_session_id uuid)
returns setof public.trace_inventory_opname_lines
language sql stable security definer set search_path=public as $$
  select * from public.trace_inventory_opname_lines
  where session_id=p_session_id and public.trace_is_team_member()
  order by updated_at desc;
$$;
revoke all on function public.trace_get_opname_lines(uuid) from public;
grant execute on function public.trace_get_opname_lines(uuid) to authenticated;
