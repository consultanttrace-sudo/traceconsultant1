-- TRACE AI deployment approval workflow. Additive; preserves existing approval records.
alter table public.trace_ai_approvals alter column approved_at drop not null;
alter table public.trace_ai_approvals add column if not exists status text not null default 'approved' check(status in ('pending','approved','executed','rejected','expired'));
alter table public.trace_ai_approvals add column if not exists requested_at timestamptz not null default now();
alter table public.trace_ai_approvals add column if not exists executed_at timestamptz;
create index if not exists trace_ai_approvals_pending_idx on public.trace_ai_approvals(actor_user_id, action, environment, status, requested_at desc);
-- Existing rows created by 004 are historical approvals; keep them approved.
update public.trace_ai_approvals set status='approved' where status is null;
