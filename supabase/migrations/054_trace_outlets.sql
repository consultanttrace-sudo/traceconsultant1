-- v72.14 — Outlet master data as a real table with team-scoped RLS and
-- audited CRUD RPCs. Closes the gap noted in HANDOFF v4 §2 point 1:
-- "trace-outlets" was only a legacy global KV blob (trace_os::trace-outlets,
-- read via trace_read_global_kv) with no write path — so outlet suggestions
-- (ScopeSelectors.tsx → outletOptionsForClient) were always empty for every
-- client, old and new. This mirrors the trace_clients pattern (042) exactly,
-- but scopes each outlet directly to one client_id (text, same scoping style
-- already used everywhere else — trace_finance_records.outlet_id,
-- trace_inventory_*, trace_opex_*, etc.) instead of going through the
-- Company → Brand → Outlet KV hierarchy, which was never actually populated.
-- Additive only: does not touch trace-companies/trace-brands (still legacy
-- KV, unused by any production flow today) or any existing table.

create table if not exists public.trace_outlets (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  name text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trace_outlets_client_id_chk check (length(trim(client_id)) > 0),
  constraint trace_outlets_name_chk check (length(trim(name)) > 0),
  constraint trace_outlets_client_name_uniq unique (client_id, name)
);

create index if not exists trace_outlets_client_idx on public.trace_outlets(client_id);

alter table public.trace_outlets enable row level security;

-- Outlet master is internal-team metadata (not per-client operational data),
-- same trust boundary as trace_clients: any active team member may read the
-- whole list (client-side code filters by clientId when building
-- suggestions — see outletOptionsForClient in core/scope.ts); only team
-- members may write, and writes only ever happen through the audited RPCs
-- below (no direct table grants to authenticated).
drop policy if exists "trace outlets team read" on public.trace_outlets;
create policy "trace outlets team read"
on public.trace_outlets
for select
to authenticated
using (public.trace_is_team_member());

drop trigger if exists trg_trace_outlets_updated_at on public.trace_outlets;
create trigger trg_trace_outlets_updated_at
before update on public.trace_outlets
for each row execute function public.trace_set_updated_at();

create or replace function public.trace_list_outlets()
returns setof public.trace_outlets
language sql stable security definer set search_path=public as $$
  select * from public.trace_outlets
  where public.trace_is_team_member()
  order by client_id asc, name asc;
$$;
revoke all on function public.trace_list_outlets() from public;
grant execute on function public.trace_list_outlets() to authenticated;

create or replace function public.trace_create_outlet(p_client_id text,p_name text,p_notes text default null)
returns public.trace_outlets
language plpgsql security definer set search_path=public as $$
declare v public.trace_outlets;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OUTLET_ACTOR_FORBIDDEN'; end if;
  if p_client_id is null or length(trim(p_client_id))=0 then raise exception 'TRACE_OUTLET_CLIENT_REQUIRED'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'TRACE_OUTLET_NAME_REQUIRED'; end if;
  insert into public.trace_outlets(client_id,name,notes,created_by)
  values(trim(p_client_id),trim(p_name),nullif(trim(p_notes),''),auth.uid())
  returning * into v;
  perform public.trace_append_audit_event('create','outlet',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_create_outlet(text,text,text) from public;
grant execute on function public.trace_create_outlet(text,text,text) to authenticated;

create or replace function public.trace_update_outlet(p_id uuid,p_name text,p_notes text)
returns public.trace_outlets
language plpgsql security definer set search_path=public as $$
declare v_before public.trace_outlets; v_after public.trace_outlets;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OUTLET_ACTOR_FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'TRACE_OUTLET_NAME_REQUIRED'; end if;
  select * into v_before from public.trace_outlets where id=p_id;
  if not found then raise exception 'TRACE_OUTLET_NOT_FOUND'; end if;
  -- client_id is intentionally not editable here: an outlet is created under
  -- one client and stays there (matches how outlet_id is used everywhere
  -- else as a fixed sub-key of client_id, never reassigned across clients).
  update public.trace_outlets
  set name=trim(p_name),
      notes=nullif(trim(p_notes),''),
      updated_at=now()
  where id=p_id
  returning * into v_after;
  perform public.trace_append_audit_event('update','outlet',p_id::text,to_jsonb(v_before),to_jsonb(v_after),null);
  return v_after;
end; $$;
revoke all on function public.trace_update_outlet(uuid,text,text) from public;
grant execute on function public.trace_update_outlet(uuid,text,text) to authenticated;

create or replace function public.trace_delete_outlet(p_id uuid)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_before public.trace_outlets;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OUTLET_ACTOR_FORBIDDEN'; end if;
  select * into v_before from public.trace_outlets where id=p_id;
  if not found then raise exception 'TRACE_OUTLET_NOT_FOUND'; end if;
  delete from public.trace_outlets where id=p_id;
  perform public.trace_append_audit_event('delete','outlet',p_id::text,to_jsonb(v_before),null,null);
  return true;
end; $$;
revoke all on function public.trace_delete_outlet(uuid) from public;
grant execute on function public.trace_delete_outlet(uuid) to authenticated;

comment on table public.trace_outlets is 'Outlet master data per client, scoped by client_id (text, matches the outlet_id scoping style used across trace_finance_records/trace_inventory_*/trace_opex_* etc). Feeds outlet suggestions in ScopeSelectors.tsx via the "outlets" resource (netlify/functions/trace-data.js) and the legacy trace-outlets KV shim in _shared.tsx.';
