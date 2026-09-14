-- TRACE Finance Records — durable storage for Finance Guided Entry.
-- Additive only. Follows the same governance pattern as
-- trace_collaboration_tasks (011/012): RLS + optimistic lock trigger +
-- security-definer RPC that writes an immutable audit_log entry.

create extension if not exists pgcrypto;

create table if not exists public.trace_finance_records (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  outlet_id text,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category text not null check (category in ('revenue','cogs','labor','opex')),
  amount numeric not null check (amount >= 0),
  evidence_source text check (evidence_source in ('system','manual','imported')),
  evidence_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trace_finance_records_period_idx
  on public.trace_finance_records(client_id, period, category);
create index if not exists trace_finance_records_outlet_idx
  on public.trace_finance_records(outlet_id, period);

alter table public.trace_finance_records enable row level security;
revoke all on public.trace_finance_records from anon, authenticated;
-- Direct client SELECT is allowed (read own team's data);
-- INSERT/UPDATE must go through the RPC below so version + audit_log stay atomic.
grant select on public.trace_finance_records to authenticated;

drop policy if exists trace_finance_records_team_select on public.trace_finance_records;
create policy trace_finance_records_team_select
on public.trace_finance_records for select to authenticated
using (public.trace_is_team_member());

drop trigger if exists trg_trace_finance_records_updated_at on public.trace_finance_records;
create trigger trg_trace_finance_records_updated_at
before update on public.trace_finance_records
for each row execute function public.trace_set_updated_at();

-- Guard: blocks any UPDATE that bypasses the RPC's optimistic-lock contract.
create or replace function public.trace_finance_record_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'UPDATE' then
    if new.version <> old.version + 1 then raise exception 'TRACE_FINANCE_VERSION_MISMATCH'; end if;
    if new.created_by is distinct from old.created_by then raise exception 'TRACE_FINANCE_CREATOR_IMMUTABLE'; end if;
  elsif tg_op = 'INSERT' then
    if new.version <> 1 then raise exception 'TRACE_FINANCE_INITIAL_VERSION_INVALID'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trace_finance_record_guard on public.trace_finance_records;
create trigger trg_trace_finance_record_guard
before insert or update on public.trace_finance_records
for each row execute function public.trace_finance_record_guard();

-- Atomic upsert: creates a new record (p_id null) or updates an existing one
-- with optimistic lock (p_id + p_expected_version), and writes an audit_log row.
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
  p_reason text default null
) returns public.trace_finance_records
language plpgsql security definer set search_path=public as $$
declare r public.trace_finance_records;
declare before_json jsonb;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_FINANCE_ACTOR_FORBIDDEN'; end if;

  if p_id is null then
    insert into public.trace_finance_records
      (client_id, outlet_id, period, category, amount, evidence_source, evidence_note, created_by, version)
    values (p_client_id, p_outlet_id, p_period, p_category, p_amount, p_evidence_source, p_evidence_note, auth.uid(), 1)
    returning * into r;
    insert into public.trace_audit_log(actor_user_id, action, entity_type, entity_id, before_data, after_data, reason)
    values (auth.uid(), 'insert', 'finance_record', r.id::text, null,
      jsonb_build_object('period', r.period, 'category', r.category, 'amount', r.amount, 'version', r.version), p_reason);
    return r;
  end if;

  select * into r from public.trace_finance_records where id = p_id for update;
  if not found then raise exception 'TRACE_FINANCE_RECORD_NOT_FOUND'; end if;
  if r.version <> p_expected_version then raise exception 'TRACE_FINANCE_VERSION_MISMATCH'; end if;
  before_json := jsonb_build_object('period', r.period, 'category', r.category, 'amount', r.amount, 'version', r.version);

  update public.trace_finance_records set
    outlet_id = p_outlet_id, period = p_period, category = p_category, amount = p_amount,
    evidence_source = p_evidence_source, evidence_note = p_evidence_note,
    version = version + 1, updated_at = now()
  where id = p_id and version = p_expected_version
  returning * into r;
  if not found then raise exception 'TRACE_FINANCE_CONCURRENT_UPDATE'; end if;

  insert into public.trace_audit_log(actor_user_id, action, entity_type, entity_id, before_data, after_data, reason)
  values (auth.uid(), 'update', 'finance_record', r.id::text, before_json,
    jsonb_build_object('period', r.period, 'category', r.category, 'amount', r.amount, 'version', r.version), p_reason);
  return r;
end; $$;

revoke all on function public.trace_upsert_finance_record(uuid,text,text,text,text,numeric,text,text,bigint,text) from public;
grant execute on function public.trace_upsert_finance_record(uuid,text,text,text,text,numeric,text,text,bigint,text) to authenticated;
