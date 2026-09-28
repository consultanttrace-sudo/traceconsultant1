-- Regression test v74.1: approve -> trace_finance_records, dijalankan di Postgres nyata.
-- Jalankan setelah semua migration (001..058). Gagal (ERROR) bila fungsi rusak lagi.
\set ON_ERROR_STOP on
insert into auth.users(id,email) values('22222222-2222-2222-2222-222222222222','reg@trace.test') on conflict do nothing;
insert into public.trace_team_members(user_id,active) values('22222222-2222-2222-2222-222222222222',true) on conflict do nothing;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \gset
set role authenticated;
select public.trace_transition_data_intake(repeat('d',64),'reg.xlsx','xlsx','draft','{"monthlyBreakdown":[{"period":"2026-01","revenue":10,"cogs":4,"labor":2,"opex":1}]}'::jsonb,'[]'::jsonb,'reg-client') is not null;
select public.trace_transition_data_intake(repeat('d',64),'reg.xlsx','xlsx','reviewed','{"monthlyBreakdown":[{"period":"2026-01","revenue":10,"cogs":4,"labor":2,"opex":1}]}'::jsonb,'[]'::jsonb,'reg-client') is not null;
select public.trace_transition_data_intake(repeat('d',64),'reg.xlsx','xlsx','approved','{"monthlyBreakdown":[{"period":"2026-01","revenue":10,"cogs":4,"labor":2,"opex":1}]}'::jsonb,'[]'::jsonb,'reg-client') is not null;
reset role;
do $$ begin
  if (select count(*) from public.trace_finance_records where client_id='reg-client')<>4 then raise exception 'REGRESSION: approve tidak menghasilkan 4 finance record'; end if;
end $$;
\echo PASS approve_finance_commit
