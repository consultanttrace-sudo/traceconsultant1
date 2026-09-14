-- TRACE Data Intake: clients can prepare/review/approve, but only trusted server workflows may mark an import committed.
create or replace function public.trace_data_intake_import_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op='UPDATE' then
    if new.actor_user_id is distinct from old.actor_user_id or new.source_hash is distinct from old.source_hash or new.source_name is distinct from old.source_name or new.source_type is distinct from old.source_type then
      raise exception 'TRACE_IMPORT_PROVENANCE_IMMUTABLE';
    end if;
    if new.status='committed' and auth.uid() is not null then
      raise exception 'TRACE_IMPORT_COMMIT_SERVER_ONLY';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_trace_data_intake_import_guard on public.trace_data_intake_imports;
create trigger trg_trace_data_intake_import_guard before update on public.trace_data_intake_imports for each row execute function public.trace_data_intake_import_guard();
