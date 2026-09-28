-- v74.1 FIX (ditemukan lewat eksekusi nyata di Postgres lokal, bukan baca kode):
-- trace_commit_intake_finance (migration 038) memakai variabel PL/pgSQL bernama
-- "category", padahal tabel trace_finance_records juga punya kolom "category".
-- Pada klausa ON CONFLICT (client_id,source_import_hash,period,category)
-- Postgres tidak bisa memilih antara variabel dan kolom, sehingga SETIAP approve
-- gagal dengan: ERROR: column reference "category" is ambiguous.
-- Akibatnya (sejak 057 atomic) approve di-rollback -> tidak ada trace_finance_records
-- -> Overview kosong.
-- Perbaikan: semua variabel lokal diberi prefix v_ sehingga tidak bisa bentrok
-- dengan nama kolom mana pun. Logika bisnis TIDAK diubah.
create or replace function public.trace_commit_intake_finance(
  p_client_id text, p_source_hash text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  imp record; v_item jsonb; v_category text; v_amount numeric;
  v_inserted integer:=0; v_skipped integer:=0; v_periods integer:=0;
  v_section text; v_label text;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_FINANCE_IMPORT_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is null or nullif(trim(p_source_hash),'') is null then raise exception 'TRACE_FINANCE_IMPORT_SCOPE_REQUIRED'; end if;
  select * into imp from public.trace_data_intake_imports
    where client_id=trim(p_client_id) and source_hash=lower(trim(p_source_hash)) and status='approved'
    order by updated_at desc limit 1;
  if not found then raise exception 'TRACE_FINANCE_IMPORT_NOT_APPROVED_OR_SCOPED'; end if;
  for v_item in select * from jsonb_array_elements(coalesce(imp.payload->'monthlyBreakdown','[]'::jsonb)) loop
    v_periods:=v_periods+1;
    foreach v_category in array array['revenue','cogs','labor','opex'] loop
      v_amount:=case when v_item ? v_category and jsonb_typeof(v_item->v_category)='number' then (v_item->>v_category)::numeric else null end;
      if v_amount is null then continue; end if;
      if v_amount < 0 then raise exception 'TRACE_FINANCE_NEGATIVE_IMPORTED_AMOUNT'; end if;
      v_section:=case v_category when 'revenue' then 'pendapatan_usaha' when 'cogs' then 'biaya_produksi' else 'biaya_operasional' end;
      v_label:=case v_category when 'revenue' then 'Revenue' when 'cogs' then 'COGS / HPP' when 'labor' then 'Labor / Payroll' else 'OPEX' end;
      insert into public.trace_finance_records(client_id,outlet_id,period,category,amount,evidence_source,evidence_note,account_label,statement_section,source_import_hash,source_import_id,created_by,version)
      values(trim(p_client_id),null,v_item->>'period',v_category,v_amount,'imported',concat('Imported from approved Data Intake: ',imp.source_name),v_label,v_section,lower(trim(p_source_hash)),imp.id,auth.uid(),1)
      on conflict (client_id,source_import_hash,period,category) where source_import_hash is not null do nothing;
      if found then v_inserted:=v_inserted+1; else v_skipped:=v_skipped+1; end if;
    end loop;
  end loop;
  perform public.trace_append_audit_event('finance_import_commit','finance_import',p_source_hash,null,jsonb_build_object('client_id',p_client_id,'period_count',v_periods,'inserted',v_inserted,'skipped',v_skipped),null);
  return jsonb_build_object('clientId',p_client_id,'sourceHash',p_source_hash,'periodCount',v_periods,'inserted',v_inserted,'skipped',v_skipped);
end; $$;
revoke all on function public.trace_commit_intake_finance(text,text) from public;
grant execute on function public.trace_commit_intake_finance(text,text) to authenticated;
