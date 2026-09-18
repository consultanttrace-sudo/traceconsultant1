-- v72.15 — Marketing/Content/KPI/SOP/Action Plan, Tahap 2/4: SOP.
-- Skema mengikuti bentuk SOP/SOPStep di src/core/sop.ts. Aturan gate
-- "step tidak bisa 'done' tanpa requiredEvidence terpenuhi" (dari
-- validateSOP()) DITEGAKKAN ULANG di RPC trace_update_sop_step supaya
-- tidak bisa dilewati lewat write langsung ke tabel — bukan cuma
-- divalidasi di client seperti fungsi TS aslinya.
--
-- Fitur "melebihi aplikasi luar sana": SOP versioning penuh (histori
-- semua versi tersimpan, bukan overwrite), bukan cuma dokumen SOP statis.

-- ============================================================
-- 1. SOP (per organisasi, mendukung banyak versi historis)
-- ============================================================
create table if not exists public.trace_sops (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  sop_key text not null,
  name text not null,
  purpose text not null,
  trigger_condition text not null,
  version int not null default 1,
  is_current boolean not null default true,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, sop_key, version)
);
create unique index if not exists trace_sops_one_current_per_key
  on public.trace_sops(organization_id, sop_key) where is_current;
alter table public.trace_sops enable row level security;
revoke all on public.trace_sops from anon, authenticated;
grant select on public.trace_sops to authenticated;
drop policy if exists trace_sops_team_select on public.trace_sops;
create policy trace_sops_team_select on public.trace_sops
for select to authenticated using (public.trace_is_team_member());

-- ============================================================
-- 2. SOP STEPS
-- ============================================================
create table if not exists public.trace_sop_steps (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.trace_sops(id) on delete cascade,
  step_order int not null,
  title text not null,
  instruction text not null,
  owner text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','done','blocked')),
  required_evidence jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  control text not null,
  updated_at timestamptz not null default now(),
  unique(sop_id, step_order)
);
alter table public.trace_sop_steps enable row level security;
revoke all on public.trace_sop_steps from anon, authenticated;
grant select on public.trace_sop_steps to authenticated;
drop policy if exists trace_sop_steps_team_select on public.trace_sop_steps;
create policy trace_sop_steps_team_select on public.trace_sop_steps
for select to authenticated using (public.trace_is_team_member());

-- ============================================================
-- 3. RPC — buat SOP versi baru (versi 1 kalau sop_key belum ada)
-- ============================================================
create or replace function public.trace_create_sop_version(
  p_client_id text,p_sop_key text,p_name text,p_purpose text,p_trigger_condition text,
  p_steps jsonb -- array of {title,instruction,owner,control,required_evidence:[]}
) returns public.trace_sops
language plpgsql security definer set search_path=public as $$
declare
  v public.trace_sops;
  v_next_version int;
  st jsonb; v_order int := 0;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_SOP_ACTOR_FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name))=0 or p_purpose is null or length(trim(p_purpose))=0
     or p_trigger_condition is null or length(trim(p_trigger_condition))=0 then
    raise exception 'TRACE_SOP_IDENTITY_REQUIRED';
  end if;
  if jsonb_array_length(coalesce(p_steps,'[]'::jsonb)) = 0 then raise exception 'TRACE_SOP_STEPS_REQUIRED'; end if;

  select coalesce(max(version),0)+1 into v_next_version
  from public.trace_sops where organization_id=trim(p_client_id) and sop_key=p_sop_key;

  update public.trace_sops set is_current=false
  where organization_id=trim(p_client_id) and sop_key=p_sop_key and is_current;

  insert into public.trace_sops(organization_id,sop_key,name,purpose,trigger_condition,version,created_by)
  values(trim(p_client_id),p_sop_key,trim(p_name),trim(p_purpose),trim(p_trigger_condition),v_next_version,auth.uid())
  returning * into v;

  for st in select * from jsonb_array_elements(p_steps) loop
    v_order := v_order + 1;
    if not (st ? 'title') or not (st ? 'instruction') or not (st ? 'owner') or not (st ? 'control') then
      raise exception 'TRACE_SOP_STEP_FIELDS_REQUIRED:%',v_order;
    end if;
    insert into public.trace_sop_steps(sop_id,step_order,title,instruction,owner,control,required_evidence)
    values(v.id,v_order,st->>'title',st->>'instruction',st->>'owner',st->>'control',
           coalesce(st->'required_evidence','[]'::jsonb));
  end loop;

  perform public.trace_append_audit_event('create_version','sop',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_create_sop_version(text,text,text,text,text,jsonb) from public;
grant execute on function public.trace_create_sop_version(text,text,text,text,text,jsonb) to authenticated;

-- ============================================================
-- 4. RPC — update status step, dengan evidence-gate ditegakkan di server
-- ============================================================
create or replace function public.trace_update_sop_step(p_step_id uuid,p_status text,p_evidence jsonb)
returns public.trace_sop_steps
language plpgsql security definer set search_path=public as $$
declare v public.trace_sop_steps; v_required jsonb; v_missing jsonb;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_SOP_ACTOR_FORBIDDEN'; end if;
  if p_status not in ('pending','in_progress','done','blocked') then raise exception 'TRACE_SOP_STEP_STATUS_INVALID'; end if;

  select required_evidence into v_required from public.trace_sop_steps where id=p_step_id;
  if v_required is null then raise exception 'TRACE_SOP_STEP_NOT_FOUND'; end if;

  if p_status = 'done' then
    select coalesce(jsonb_agg(e),'[]'::jsonb) into v_missing
    from jsonb_array_elements_text(v_required) e
    where not (coalesce(p_evidence,'[]'::jsonb) ? e);
    if jsonb_array_length(v_missing) > 0 then
      raise exception 'TRACE_SOP_STEP_MISSING_EVIDENCE:%',v_missing;
    end if;
  end if;

  update public.trace_sop_steps
  set status=p_status, evidence=coalesce(p_evidence,evidence), updated_at=now()
  where id=p_step_id
  returning * into v;

  perform public.trace_append_audit_event('update_step','sop_step',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_update_sop_step(uuid,text,jsonb) from public;
grant execute on function public.trace_update_sop_step(uuid,text,jsonb) to authenticated;

-- ============================================================
-- 5. RPC — baca (SOP aktif saat ini + langkah-langkahnya; histori versi)
-- ============================================================
create or replace function public.trace_list_sops(p_client_id text,p_current_only boolean default true)
returns setof public.trace_sops
language sql stable security definer set search_path=public as $$
  select * from public.trace_sops
  where public.trace_is_team_member() and organization_id=trim(p_client_id)
    and active and (not p_current_only or is_current)
  order by name asc, version desc;
$$;
revoke all on function public.trace_list_sops(text,boolean) from public;
grant execute on function public.trace_list_sops(text,boolean) to authenticated;

create or replace function public.trace_get_sop_steps(p_sop_id uuid)
returns setof public.trace_sop_steps
language sql stable security definer set search_path=public as $$
  select * from public.trace_sop_steps
  where sop_id=p_sop_id and public.trace_is_team_member()
  order by step_order asc;
$$;
revoke all on function public.trace_get_sop_steps(uuid) from public;
grant execute on function public.trace_get_sop_steps(uuid) to authenticated;

-- Kemajuan eksekusi SOP terhadap satu sop_id (dipakai UI progress bar)
create or replace function public.trace_sop_progress(p_sop_id uuid)
returns table(total_steps int, done_steps int, blocked_steps int, completion_pct numeric)
language sql stable security definer set search_path=public as $$
  select count(*)::int, count(*) filter (where status='done')::int, count(*) filter (where status='blocked')::int,
    case when count(*)=0 then 0 else round(count(*) filter (where status='done')::numeric/count(*)*100,1) end
  from public.trace_sop_steps where sop_id=p_sop_id and public.trace_is_team_member();
$$;
revoke all on function public.trace_sop_progress(uuid) from public;
grant execute on function public.trace_sop_progress(uuid) to authenticated;
