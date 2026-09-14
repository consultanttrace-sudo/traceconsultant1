-- TRACE v72 — accounting foundation and auditable COGS chain.
create extension if not exists pgcrypto;

create table if not exists public.trace_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  code text not null,
  name text not null,
  account_type text not null check(account_type in ('asset','liability','equity','revenue','cogs','expense')),
  parent_id uuid references public.trace_accounts(id) on delete restrict,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(client_id,code)
);
create index if not exists trace_accounts_client_idx on public.trace_accounts(client_id,active,code);

create table if not exists public.trace_journal_entries (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  entry_date date not null,
  reference_type text,
  reference_id text,
  memo text not null,
  source text not null check(source in ('manual','imported','system','adjustment')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trace_journal_entries_client_date_idx on public.trace_journal_entries(client_id,entry_date desc);

create table if not exists public.trace_journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.trace_journal_entries(id) on delete cascade,
  client_id text not null,
  account_id uuid not null references public.trace_accounts(id) on delete restrict,
  debit numeric not null default 0 check(debit >= 0),
  credit numeric not null default 0 check(credit >= 0),
  memo text,
  created_at timestamptz not null default now(),
  check((debit = 0 and credit > 0) or (credit = 0 and debit > 0))
);
create index if not exists trace_journal_lines_client_idx on public.trace_journal_lines(client_id,account_id);

alter table public.trace_accounts enable row level security;
alter table public.trace_journal_entries enable row level security;
alter table public.trace_journal_lines enable row level security;
revoke all on public.trace_accounts,public.trace_journal_entries,public.trace_journal_lines from anon,authenticated;

create or replace function public.trace_post_balanced_journal(
  p_client_id text,p_entry_date date,p_reference_type text,p_reference_id text,p_memo text,p_source text,p_lines jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare entry_id uuid; line jsonb; total_debit numeric:=0; total_credit numeric:=0; account uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_JOURNAL_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is null or nullif(trim(p_memo),'') is null then raise exception 'TRACE_JOURNAL_SCOPE_REQUIRED'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then raise exception 'TRACE_JOURNAL_LINES_REQUIRED'; end if;
  insert into public.trace_journal_entries(client_id,entry_date,reference_type,reference_id,memo,source,created_by)
  values(trim(p_client_id),p_entry_date,p_reference_type,p_reference_id,p_memo,p_source,auth.uid()) returning id into entry_id;
  for line in select * from jsonb_array_elements(p_lines) loop
    account := (line->>'account_id')::uuid;
    if not exists(select 1 from public.trace_accounts a where a.id=account and a.client_id=trim(p_client_id) and a.active) then raise exception 'TRACE_ACCOUNT_SCOPE_MISMATCH'; end if;
    insert into public.trace_journal_lines(entry_id,client_id,account_id,debit,credit,memo)
    values(entry_id,trim(p_client_id),account,coalesce((line->>'debit')::numeric,0),coalesce((line->>'credit')::numeric,0),line->>'memo');
    total_debit := total_debit + coalesce((line->>'debit')::numeric,0);
    total_credit := total_credit + coalesce((line->>'credit')::numeric,0);
  end loop;
  if total_debit <= 0 or total_debit <> total_credit then raise exception 'TRACE_JOURNAL_NOT_BALANCED'; end if;
  perform public.trace_append_audit_event('insert','journal_entry',entry_id::text,null,jsonb_build_object('client_id',p_client_id,'debit',total_debit,'credit',total_credit),null);
  return entry_id;
end; $$;
revoke all on function public.trace_post_balanced_journal(text,date,text,text,text,text,jsonb) from public;
grant execute on function public.trace_post_balanced_journal(text,date,text,text,text,text,jsonb) to authenticated;

-- Protect the accounting tables from accidental direct browser mutation/read.
comment on table public.trace_accounts is 'Client-scoped chart of accounts.';
comment on table public.trace_journal_entries is 'Client-scoped immutable journal headers.';
comment on table public.trace_journal_lines is 'Client-scoped balanced journal lines.';
