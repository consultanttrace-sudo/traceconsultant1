-- TRACE Analisa Konten & Medsos — kalender/rencana konten ke depan.
-- DRAFT — belum dijalankan/diverifikasi. Depends on migration 017.
--
-- Ini tabel "rencana" (belum tentu jadi konten beneran), dipisah dari
-- trace_content_items yang isinya konten yang SUDAH ditarik dari API
-- (sudah tayang). Begitu rencana ini benar-benar diposting dan tersinkron
-- lewat API, `content_item_id` diisi manual/otomatis untuk menautkan
-- rencana ke hasil aktualnya — dari situ nanti feedback loop akurasi
-- rekomendasi (poin 4 di prompt asli) bisa dihitung: rencana bilang "jam
-- 20:00", hasil aktual tayang jam berapa dan reach-nya berapa.

create table if not exists public.trace_content_plans (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  is_internal_account boolean not null default false,
  platform text not null check (platform in ('instagram','tiktok')),
  content_type text check (content_type in ('reel','post','story','video','other')),
  topic text,
  brief text,
  recommended_posting_time timestamptz,
  recommendation_source text,
  planned_date date not null,
  status text not null default 'idea' check (status in ('idea','draft','ready','scheduled','posted','cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  content_item_id uuid references public.trace_content_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trace_content_plans_client_idx
  on public.trace_content_plans(client_id, planned_date, status);

alter table public.trace_content_plans enable row level security;
revoke all on table public.trace_content_plans from anon, authenticated;
grant select, insert, update on table public.trace_content_plans to authenticated;

drop policy if exists trace_content_plans_rw on public.trace_content_plans;
create policy trace_content_plans_rw
on public.trace_content_plans
for all
to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member());

drop trigger if exists trg_trace_content_plans_updated_at on public.trace_content_plans;
create trigger trg_trace_content_plans_updated_at
  before update on public.trace_content_plans
  for each row execute function public.trace_set_updated_at();

-- Status transition digatekeep lewat function, mengikuti pola
-- trace_transition_data_intake (migration 014) — supaya tidak ada lompat
-- status sembarangan (mis. 'idea' langsung ke 'posted' tanpa lewat proses).
create or replace function public.trace_transition_content_plan(
  p_plan_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.trace_content_plans%rowtype;
  v_current text;
begin
  if not public.trace_is_team_member() then
    raise exception 'TRACE_CONTENT_PLAN_TEAM_MEMBER_REQUIRED';
  end if;

  select * into v_row from public.trace_content_plans where id = p_plan_id for update;
  if not found then
    raise exception 'TRACE_CONTENT_PLAN_NOT_FOUND';
  end if;
  v_current := v_row.status;

  if p_status not in ('idea','draft','ready','scheduled','posted','cancelled') then
    raise exception 'TRACE_CONTENT_PLAN_INVALID_STATUS';
  end if;

  if v_current='idea' and p_status not in ('idea','draft','cancelled') then
    raise exception 'TRACE_CONTENT_PLAN_INVALID_TRANSITION:idea:%', p_status;
  elsif v_current='draft' and p_status not in ('draft','ready','cancelled') then
    raise exception 'TRACE_CONTENT_PLAN_INVALID_TRANSITION:draft:%', p_status;
  elsif v_current='ready' and p_status not in ('ready','scheduled','cancelled') then
    raise exception 'TRACE_CONTENT_PLAN_INVALID_TRANSITION:ready:%', p_status;
  elsif v_current='scheduled' and p_status not in ('scheduled','posted','cancelled') then
    raise exception 'TRACE_CONTENT_PLAN_INVALID_TRANSITION:scheduled:%', p_status;
  elsif v_current='posted' and p_status<>'posted' then
    raise exception 'TRACE_CONTENT_PLAN_INVALID_TRANSITION:posted:%', p_status;
  elsif v_current='cancelled' and p_status not in ('cancelled','idea') then
    raise exception 'TRACE_CONTENT_PLAN_INVALID_TRANSITION:cancelled:%', p_status;
  end if;

  update public.trace_content_plans set status=p_status where id=p_plan_id returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

revoke all on function public.trace_transition_content_plan(uuid,text) from public;
grant execute on function public.trace_transition_content_plan(uuid,text) to authenticated;

-- CATATAN BELUM SELESAI:
-- 1. `recommendation_source` (text bebas) belum ditautkan ke sistem
--    rekomendasi/feedback-loop otomatis (poin 4 prompt asli, "skor akurasi
--    historis") — itu belum dirancang skemanya sama sekali, menyusul kalau
--    modul reach/engagement (017) sudah cukup data historis untuk dianalisa.
-- 2. Belum diputuskan siapa yang assign `assigned_to` — apakah cuma 3 orang
--    tim Trace, atau nanti ada kolaborator lepas (freelance content
--    creator) yang juga perlu akses terbatas.
