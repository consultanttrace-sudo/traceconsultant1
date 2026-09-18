-- TRACE v72.7 Finance Intelligence: import bridge + integrity guards.
create extension if not exists pgcrypto;

alter table public.trace_finance_records
  add column if not exists source_import_hash text,
  add column if not exists source_import_id uuid;

create index if not exists trace_finance_records_source_import_idx
  on public.trace_finance_records(client_id, source_import_hash, period, category);

create unique index if not exists trace_finance_records_import_unique
  on public.trace_finance_records(client_id, source_import_hash, period, category)
  where source_import_hash is not null;

-- Imported finance is derived from the APPROVED Data Intake payload. The server
-- never trusts a client-supplied monthly total for this bridge.
create or replace function public.trace_commit_intake_finance(
  p_client_id text, p_source_hash text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare imp record; item jsonb; category text; amount numeric; inserted_count integer:=0; skipped_count integer:=0; period_count integer:=0;
declare section text; label text;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_FINANCE_IMPORT_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is null or nullif(trim(p_source_hash),'') is null then raise exception 'TRACE_FINANCE_IMPORT_SCOPE_REQUIRED'; end if;
  select * into imp from public.trace_data_intake_imports
    where client_id=trim(p_client_id) and source_hash=lower(trim(p_source_hash)) and status='approved'
    order by updated_at desc limit 1;
  if not found then raise exception 'TRACE_FINANCE_IMPORT_NOT_APPROVED_OR_SCOPED'; end if;
  for item in select * from jsonb_array_elements(coalesce(imp.payload->'monthlyBreakdown','[]'::jsonb)) loop
    period_count:=period_count+1;
    foreach category in array array['revenue','cogs','labor','opex'] loop
      amount:=case when item ? category and jsonb_typeof(item->category)='number' then (item->>category)::numeric else null end;
      if amount is null then continue; end if;
      if amount < 0 then raise exception 'TRACE_FINANCE_NEGATIVE_IMPORTED_AMOUNT'; end if;
      section:=case category when 'revenue' then 'pendapatan_usaha' when 'cogs' then 'biaya_produksi' else 'biaya_operasional' end;
      label:=case category when 'revenue' then 'Revenue' when 'cogs' then 'COGS / HPP' when 'labor' then 'Labor / Payroll' else 'OPEX' end;
      insert into public.trace_finance_records(client_id,outlet_id,period,category,amount,evidence_source,evidence_note,account_label,statement_section,source_import_hash,source_import_id,created_by,version)
      values(trim(p_client_id),null,item->>'period',category,amount,'imported',concat('Imported from approved Data Intake: ',imp.source_name),label,section,lower(trim(p_source_hash)),imp.id,auth.uid(),1)
      on conflict (client_id,source_import_hash,period,category) where source_import_hash is not null do nothing;
      if found then inserted_count:=inserted_count+1; else skipped_count:=skipped_count+1; end if;
    end loop;
  end loop;
  perform public.trace_append_audit_event('finance_import_commit','finance_import',p_source_hash,null,jsonb_build_object('client_id',p_client_id,'period_count',period_count,'inserted',inserted_count,'skipped',skipped_count),null);
  return jsonb_build_object('clientId',p_client_id,'sourceHash',p_source_hash,'periodCount',period_count,'inserted',inserted_count,'skipped',skipped_count);
end; $$;
revoke all on function public.trace_commit_intake_finance(text,text) from public;
grant execute on function public.trace_commit_intake_finance(text,text) to authenticated;

-- Finance Guided Entry respects period locks as well.
create or replace function public.trace_finance_period_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.trace_period_locks pl where pl.client_id=coalesce(new.client_id,'') and pl.period=coalesce(new.period,'')) then raise exception 'TRACE_PERIOD_LOCKED'; end if;
  return new;
end; $$;
drop trigger if exists trg_trace_finance_period_guard on public.trace_finance_records;
create trigger trg_trace_finance_period_guard before insert or update on public.trace_finance_records for each row execute function public.trace_finance_period_guard();

-- Imported records must carry provenance; manual/system records must still state their source.
create or replace function public.trace_finance_provenance_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.evidence_source='imported' and nullif(new.source_import_hash,'') is null then raise exception 'TRACE_FINANCE_IMPORTED_PROVENANCE_REQUIRED'; end if;
  if new.evidence_source='manual' and nullif(new.evidence_note,'') is null then raise exception 'TRACE_FINANCE_MANUAL_EVIDENCE_REQUIRED'; end if;
  return new;
end; $$;
drop trigger if exists trg_trace_finance_provenance_guard on public.trace_finance_records;
create trigger trg_trace_finance_provenance_guard before insert or update on public.trace_finance_records for each row execute function public.trace_finance_provenance_guard();
