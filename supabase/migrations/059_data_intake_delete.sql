-- v74.2 — there was no way to delete a Data Intake import or the finance
-- records it created. Combined with the client-scope bug fixed alongside
-- this migration (Data Intake had its own disconnected client selector),
-- repeated test/duplicate uploads left trace_data_intake_imports and
-- trace_finance_records full of orphaned rows with no cleanup path at all.
-- Client deletion already existed (trace_delete_client, migration ~027);
-- this adds the missing counterpart for one import + its finance rows.
create or replace function public.trace_delete_intake_import(
  p_client_id text, p_source_hash text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_hash text:=lower(trim(coalesce(p_source_hash,'')));
  v_client text:=nullif(trim(coalesce(p_client_id,'')),'');
  v_deleted_finance integer:=0;
  v_deleted_import integer:=0;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_INTAKE_DELETE_ACTOR_FORBIDDEN'; end if;
  if v_client is null or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'TRACE_INTAKE_DELETE_SCOPE_REQUIRED'; end if;
  if not public.trace_is_org_member(v_client) then raise exception 'TRACE_INTAKE_DELETE_CLIENT_FORBIDDEN'; end if;

  delete from public.trace_finance_records
    where client_id=v_client and source_import_hash=v_hash;
  get diagnostics v_deleted_finance = row_count;

  delete from public.trace_data_intake_imports
    where client_id=v_client and source_hash=v_hash;
  get diagnostics v_deleted_import = row_count;

  perform public.trace_append_audit_event('data_intake_delete','data_intake_import',v_hash,null,
    jsonb_build_object('client_id',v_client,'deleted_finance_records',v_deleted_finance,'deleted_import_rows',v_deleted_import),null);

  return jsonb_build_object('clientId',v_client,'sourceHash',v_hash,'deletedFinance',v_deleted_finance,'deletedImport',v_deleted_import);
end; $$;
revoke all on function public.trace_delete_intake_import(text,text) from public;
grant execute on function public.trace_delete_intake_import(text,text) to authenticated;
