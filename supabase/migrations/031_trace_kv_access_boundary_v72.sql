-- TRACE v72.1 — close the remaining direct browser path to legacy trace_kv.
-- Operational client data is already moved behind client-scoped RPCs. The
-- legacy table is now server-managed even for global internal metadata.
create or replace function public.trace_read_global_kv(p_keys text[])
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  result jsonb := '{}'::jsonb;
  k text;
  allowed constant text[] := array[
    'trace_os::trace-clients','trace_os::trace-companies','trace_os::trace-brands',
    'trace_os::trace-outlets','trace_os::trace-team','trace_os::trace-timeline',
    'trace_os::trace-kpi-individu','trace_os::trace-kpi-indikator-def',
    'trace_os::trace-marketing-event'
  ];
  raw text;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_GLOBAL_KV_ACTOR_FORBIDDEN'; end if;
  foreach k in array coalesce(p_keys,'{}'::text[]) loop
    if k is null or not (k = any(allowed)) then raise exception 'TRACE_GLOBAL_KV_KEY_FORBIDDEN'; end if;
    select value into raw from public.trace_kv where key=k;
    if raw is null then result := result || jsonb_build_object(k,'[]'::jsonb); continue; end if;
    begin
      result := result || jsonb_build_object(k,raw::jsonb);
    exception when others then
      raise exception 'TRACE_GLOBAL_KV_INVALID_JSON';
    end;
  end loop;
  return result;
end; $$;
revoke all on function public.trace_read_global_kv(text[]) from public;
grant execute on function public.trace_read_global_kv(text[]) to authenticated;

create or replace function public.trace_upsert_global_kv(p_key text,p_value jsonb)
returns boolean
language plpgsql security definer set search_path=public as $$
declare
  allowed constant text[] := array['trace_os::trace-clients','trace_os::acquisitionLeads'];
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_GLOBAL_KV_ACTOR_FORBIDDEN'; end if;
  if p_key is null or not (p_key = any(allowed)) then raise exception 'TRACE_GLOBAL_KV_KEY_FORBIDDEN'; end if;
  if p_value is null then raise exception 'TRACE_GLOBAL_KV_VALUE_REQUIRED'; end if;
  if octet_length(p_value::text) > 3000000 then raise exception 'TRACE_GLOBAL_KV_VALUE_TOO_LARGE'; end if;
  insert into public.trace_kv(key,value,updated_at) values(p_key,p_value::text,now())
  on conflict(key) do update set value=excluded.value,updated_at=now();
  return true;
end; $$;
revoke all on function public.trace_upsert_global_kv(text,jsonb) from public;
grant execute on function public.trace_upsert_global_kv(text,jsonb) to authenticated;

-- No authenticated browser session should query the legacy key/value table
-- directly. Existing rows remain intact and can only be reached through the
-- allowlisted server-side functions above.
revoke all on table public.trace_kv from anon, authenticated;
