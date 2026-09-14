-- TRACE workflow integrity guards.
-- Additive migration: do not edit previously applied migrations.

-- Operational job lifecycle guard: prevent impossible status jumps while
-- preserving explicit pause/stop/resume semantics.
create or replace function public.trace_job_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status='QUEUED' and new.status in ('RUNNING','STOPPING','FAILED')) or
      (old.status='RUNNING' and new.status in ('PAUSING','STOPPING','COMPLETED','PARTIAL_FAILURE','FAILED','RESUMABLE')) or
      (old.status='PAUSING' and new.status in ('PAUSED','STOPPING','FAILED')) or
      (old.status='PAUSED' and new.status in ('RUNNING','STOPPING','RESUMABLE','FAILED')) or
      (old.status='STOPPING' and new.status in ('STOPPED','RESUMABLE','FAILED')) or
      (old.status='STOPPED' and new.status='RESUMABLE') or
      (old.status='RESUMABLE' and new.status in ('RUNNING','FAILED'))
    ) then
      raise exception 'TRACE_JOB_INVALID_STATUS_TRANSITION:%:%', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trace_job_status_guard on public.trace_jobs;
create trigger trg_trace_job_status_guard
before update on public.trace_jobs
for each row execute function public.trace_job_status_guard();

-- Checkpoint sequence guard: unique(job_id, sequence_no) prevents duplicates,
-- while this guard prevents out-of-order recovery points.
create or replace function public.trace_checkpoint_sequence_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_sequence bigint;
begin
  select max(sequence_no) into max_sequence
  from public.trace_job_checkpoints
  where job_id = new.job_id;
  if max_sequence is not null and new.sequence_no <= max_sequence then
    raise exception 'TRACE_CHECKPOINT_SEQUENCE_NOT_MONOTONIC';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trace_checkpoint_sequence_guard on public.trace_job_checkpoints;
create trigger trg_trace_checkpoint_sequence_guard
before insert on public.trace_job_checkpoints
for each row execute function public.trace_checkpoint_sequence_guard();

-- Data Intake review/approval guard: client workflow is draft -> reviewed ->
-- approved, with rejection and explicit re-draft. Committed remains a server
-- terminal state; migration 008 already blocks client-side committed writes.
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
      (old.status='approved' and new.status='rejected') or
      (old.status='rejected' and new.status='draft') or
      (old.status='committed' and new.status='committed')
    ) then
      raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:%:%', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trace_data_intake_status_guard on public.trace_data_intake_imports;
create trigger trg_trace_data_intake_status_guard
before update on public.trace_data_intake_imports
for each row execute function public.trace_data_intake_status_guard();
