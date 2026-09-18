-- v72.16 — Bulk seed for the richer chart of accounts defined in
-- src/core/chartOfAccounts.ts (`defaultChartOfAccounts`), used by the new
-- "Chart of Accounts" tab (ChartOfAccountsView).
--
-- trace_seed_default_chart (migration 030) already exists but seeds its own
-- small hardcoded 10-account list. This is a separate, generic RPC that takes
-- whatever rows the frontend computed from `defaultChartOfAccounts(clientId)`
-- and inserts them into the SAME public.trace_accounts table — but ONLY when
-- that client has zero accounts so far. It never overwrites or touches
-- accounts a consultant already created or is using in AccountingView.
--
-- Direct table access to trace_accounts is revoked from anon/authenticated
-- (migration 028), so this SECURITY DEFINER function is the only write path,
-- same pattern as trace_seed_default_chart.

create or replace function public.trace_seed_chart_of_accounts_bulk(p_client_id text, p_rows jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare
  n integer := 0;
  existing integer;
  rec record;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_COA_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is null then raise exception 'TRACE_CLIENT_ID_REQUIRED'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'TRACE_COA_ROWS_REQUIRED';
  end if;

  -- Guard: never seed on top of a chart the client already has, whether it
  -- came from trace_seed_default_chart, this function, or manual entry.
  select count(*) into existing from public.trace_accounts where client_id = trim(p_client_id);
  if existing > 0 then
    raise exception 'TRACE_COA_ALREADY_SEEDED';
  end if;

  for rec in select * from jsonb_to_recordset(p_rows) as x(code text, name text, account_type text) loop
    if rec.code is null or rec.name is null or rec.account_type is null then continue; end if;
    insert into public.trace_accounts(client_id, code, name, account_type, created_by)
    values (trim(p_client_id), rec.code, rec.name, rec.account_type, auth.uid())
    on conflict (client_id, code) do nothing;
    if found then n := n + 1; end if;
  end loop;

  return n;
end; $$;

revoke all on function public.trace_seed_chart_of_accounts_bulk(text, jsonb) from public;
grant execute on function public.trace_seed_chart_of_accounts_bulk(text, jsonb) to authenticated;

comment on function public.trace_seed_chart_of_accounts_bulk(text, jsonb) is
  'Bulk-inserts chart-of-accounts rows for a client, only when that client currently has zero rows in trace_accounts. Used by ChartOfAccountsView with rows computed from src/core/chartOfAccounts.ts::defaultChartOfAccounts.';
