-- TRACE checkpoint concurrency hardening.
-- Prevent two concurrent writers from both observing the same MAX(sequence_no)
-- and then inserting checkpoints out of order. The advisory transaction lock
-- serializes inserts per job_id without blocking unrelated jobs.

create or replace function public.trace_checkpoint_sequence_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_sequence bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.job_id::text, 0));

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
