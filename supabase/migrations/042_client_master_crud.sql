-- v72.12 — Client master data as a real table with team-scoped RLS and
-- audited CRUD RPCs. Previously "trace-clients" was only readable, sourced
-- from a legacy global KV blob (trace_os::trace-clients) with no insert/
-- update/delete path anywhere in the schema — the React ClientsView was
-- read-only because there was nothing to write to. Fields mirror the
-- legacy klienForm (klien_name/klien_pkg/klien_status/klien_pic/
-- klien_folder/klien_notes) so no data model is invented from scratch.

create table if not exists public.trace_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  package text not null default 'Starter',
  status text not null default 'Trial',
  pic_name text,
  drive_folder_link text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trace_clients_package_chk check (package in ('Starter','Professional','Professional 1 Tahun')),
  constraint trace_clients_status_chk check (status in ('Aktif','Trial','Nonaktif'))
);

create index if not exists trace_clients_status_idx on public.trace_clients(status);

alter table public.trace_clients enable row level security;

-- Client master is internal-team metadata (not per-client operational data),
-- same trust boundary as trace_team_members/trace_audit_log: any active
-- team member may read the whole list; only team members may write, and
-- writes only ever happen through the audited RPCs below (no direct table
-- grants to authenticated).
drop policy if exists "trace clients team read" on public.trace_clients;
create policy "trace clients team read"
on public.trace_clients
for select
to authenticated
using (public.trace_is_team_member());

create or replace function public.trace_list_clients()
returns setof public.trace_clients
language sql stable security definer set search_path=public as $$
  select * from public.trace_clients
  where public.trace_is_team_member()
  order by name asc;
$$;
revoke all on function public.trace_list_clients() from public;
grant execute on function public.trace_list_clients() to authenticated;

create or replace function public.trace_create_client(p_name text,p_package text,p_status text,p_pic_name text,p_drive_folder_link text,p_notes text)
returns public.trace_clients
language plpgsql security definer set search_path=public as $$
declare v public.trace_clients;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_CLIENT_ACTOR_FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'TRACE_CLIENT_NAME_REQUIRED'; end if;
  insert into public.trace_clients(name,package,status,pic_name,drive_folder_link,notes,created_by)
  values(trim(p_name),coalesce(nullif(trim(p_package),''),'Starter'),coalesce(nullif(trim(p_status),''),'Trial'),
         nullif(trim(p_pic_name),''),nullif(trim(p_drive_folder_link),''),nullif(trim(p_notes),''),auth.uid())
  returning * into v;
  perform public.trace_append_audit_event('create','client',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_create_client(text,text,text,text,text,text) from public;
grant execute on function public.trace_create_client(text,text,text,text,text,text) to authenticated;

create or replace function public.trace_update_client(p_id uuid,p_name text,p_package text,p_status text,p_pic_name text,p_drive_folder_link text,p_notes text)
returns public.trace_clients
language plpgsql security definer set search_path=public as $$
declare v_before public.trace_clients; v_after public.trace_clients;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_CLIENT_ACTOR_FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'TRACE_CLIENT_NAME_REQUIRED'; end if;
  select * into v_before from public.trace_clients where id=p_id;
  if not found then raise exception 'TRACE_CLIENT_NOT_FOUND'; end if;
  update public.trace_clients
  set name=trim(p_name),
      package=coalesce(nullif(trim(p_package),''),package),
      status=coalesce(nullif(trim(p_status),''),status),
      pic_name=nullif(trim(p_pic_name),''),
      drive_folder_link=nullif(trim(p_drive_folder_link),''),
      notes=nullif(trim(p_notes),''),
      updated_at=now()
  where id=p_id
  returning * into v_after;
  perform public.trace_append_audit_event('update','client',p_id::text,to_jsonb(v_before),to_jsonb(v_after),null);
  return v_after;
end; $$;
revoke all on function public.trace_update_client(uuid,text,text,text,text,text,text) from public;
grant execute on function public.trace_update_client(uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.trace_delete_client(p_id uuid)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_before public.trace_clients;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_CLIENT_ACTOR_FORBIDDEN'; end if;
  select * into v_before from public.trace_clients where id=p_id;
  if not found then raise exception 'TRACE_CLIENT_NOT_FOUND'; end if;
  delete from public.trace_clients where id=p_id;
  perform public.trace_append_audit_event('delete','client',p_id::text,to_jsonb(v_before),null,null);
  return true;
end; $$;
revoke all on function public.trace_delete_client(uuid) from public;
grant execute on function public.trace_delete_client(uuid) to authenticated;
