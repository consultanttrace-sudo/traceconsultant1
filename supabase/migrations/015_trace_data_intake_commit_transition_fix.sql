-- Fix: 'approved' -> 'committed' transition was structurally unreachable.
-- Root cause: migration 009's trace_data_intake_status_guard() only allowed
-- committed -> committed, with no path INTO committed from any other state.
-- Migration 008's guard already restricts who may set committed (server-only,
-- auth.uid() is null / service-role); this migration only restores the
-- missing state-machine edge so that server-side commit workflows are not
-- blocked by the trigger itself. Do not edit migrations 006/008/009 in place.

create or replace function public.trace_data_intake_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op='UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status='draft' and new.status in ('reviewed','rejected')) or
      (old.status='reviewed' and new.status in ('approved','rejected')) or
      (old.status='approved' and new.status in ('rejected','committed')) or
      (old.status='rejected' and new.status='draft') or
      (old.status='committed' and new.status='committed')
    ) then
      raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:%:%', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

-- Trigger already points at this function name (created in migration 009);
-- create or replace above is sufficient, no need to re-create the trigger.

comment on function public.trace_data_intake_status_guard() is
  'Data Intake status state machine. approved->committed restored in 015; '
  'commit is still server-only per migration 008 guard (auth.uid() must be null).';
