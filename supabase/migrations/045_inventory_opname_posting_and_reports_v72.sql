-- v72.13 — Inventory module, Tahap 3/3: posting varians ke jurnal +
-- penyesuaian stok + laporan riwayat opname.
--
-- Menyambung ke sistem akuntansi yang SUDAH ADA (028_accounting_and_cogs_v72.sql):
-- trace_accounts / trace_journal_entries / trace_journal_lines, dilewatkan
-- via trace_post_balanced_journal(p_client_id,...) — organization_id di
-- modul inventory dan client_id di modul akuntansi adalah ruang identitas
-- yang sama (lihat trace_read_client_dataset di 029, yang memakai variabel
-- `cid` yang sama untuk keduanya). TIDAK membuat jalur posting jurnal baru.

-- ============================================================
-- 1. RPC — posting varians opname (approved -> posted)
--    Efek: (a) sesuaikan stock lot FIFO sesuai hasil fisik,
--          (b) catat ledger movement_type='opname',
--          (c) posting jurnal penyesuaian yang balanced,
--          (d) transisi sesi ke 'posted'.
-- ============================================================
create or replace function public.trace_post_opname_session(
  p_session_id uuid,
  p_expected_version bigint,
  p_inventory_asset_account_id uuid,
  p_shrinkage_expense_account_id uuid,
  p_overage_gain_account_id uuid,
  p_entry_date date default current_date
) returns public.trace_inventory_opname_sessions
language plpgsql security definer set search_path=public as $$
declare
  s public.trace_inventory_opname_sessions;
  ln record;
  v_lines jsonb := '[]'::jsonb;
  v_total_shrinkage_value numeric := 0;
  v_total_overage_value numeric := 0;
  v_remaining numeric; v_take numeric; v_lot record;
  v_prev_qty numeric; v_prev_val numeric;
  v_journal_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_OPNAME_ACTOR_FORBIDDEN'; end if;
  select * into s from public.trace_inventory_opname_sessions where id=p_session_id for update;
  if not found then raise exception 'TRACE_OPNAME_SESSION_NOT_FOUND'; end if;
  if s.status <> 'approved' then raise exception 'TRACE_OPNAME_SESSION_NOT_APPROVED'; end if;
  if s.version <> p_expected_version then raise exception 'TRACE_OPNAME_VERSION_MISMATCH'; end if;

  -- validasi akun milik organisasi yang sama & tipe yang masuk akal
  if not exists (select 1 from public.trace_accounts where id=p_inventory_asset_account_id and client_id=s.organization_id and account_type='asset' and active) then
    raise exception 'TRACE_OPNAME_INVENTORY_ACCOUNT_INVALID'; end if;
  if not exists (select 1 from public.trace_accounts where id=p_shrinkage_expense_account_id and client_id=s.organization_id and account_type in ('expense','cogs') and active) then
    raise exception 'TRACE_OPNAME_SHRINKAGE_ACCOUNT_INVALID'; end if;
  if not exists (select 1 from public.trace_accounts where id=p_overage_gain_account_id and client_id=s.organization_id and active) then
    raise exception 'TRACE_OPNAME_OVERAGE_ACCOUNT_INVALID'; end if;

  -- proses tiap baris bervarians: sesuaikan lot FIFO + catat ledger
  for ln in
    select * from public.trace_inventory_opname_lines
    where session_id=p_session_id and coalesce(variance_qty,0) <> 0
  loop
    select coalesce(sum(qty_remaining),0), coalesce(sum(qty_remaining*unit_cost),0)
      into v_prev_qty, v_prev_val
    from public.trace_inventory_stock_lots
    where item_id=ln.item_id and organization_id=s.organization_id
      and outlet_id is not distinct from s.outlet_id;

    if ln.variance_qty < 0 then
      -- shrinkage: kurangi lot FIFO tertua dulu, sama seperti issue
      v_remaining := abs(ln.variance_qty);
      for v_lot in
        select * from public.trace_inventory_stock_lots
        where item_id=ln.item_id and organization_id=s.organization_id
          and outlet_id is not distinct from s.outlet_id and qty_remaining > 0
        order by received_at asc for update
      loop
        exit when v_remaining <= 0;
        v_take := least(v_remaining, v_lot.qty_remaining);
        update public.trace_inventory_stock_lots set qty_remaining = qty_remaining - v_take where id = v_lot.id;
        v_remaining := v_remaining - v_take;
      end loop;
      v_total_shrinkage_value := v_total_shrinkage_value + abs(ln.variance_value);
    else
      -- overage: buka lot baru dengan cost = expected_unit_cost sesi ini
      insert into public.trace_inventory_stock_lots(organization_id,outlet_id,item_id,qty_received,qty_remaining,unit_cost,source_ref,created_by)
      values(s.organization_id,s.outlet_id,ln.item_id,ln.variance_qty,ln.variance_qty,
             coalesce(ln.expected_unit_cost,0),'opname:'||s.id::text,auth.uid());
      v_total_overage_value := v_total_overage_value + ln.variance_value;
    end if;

    insert into public.trace_inventory_ledger(
      organization_id,outlet_id,item_id,movement_type,qty,unit_cost,balance_qty,balance_value,ref_type,ref_id,notes,created_by)
    values(
      s.organization_id,s.outlet_id,ln.item_id,'opname',ln.variance_qty,coalesce(ln.expected_unit_cost,0),
      v_prev_qty+ln.variance_qty, v_prev_val+ln.variance_value,
      'inventory_opname_session',s.id,
      coalesce(ln.variance_reason_code,'')||coalesce(': '||ln.variance_reason,''),auth.uid());
  end loop;

  -- bangun jurnal penyesuaian balanced hanya jika ada nilai varians
  if v_total_shrinkage_value > 0 or v_total_overage_value > 0 then
    if v_total_shrinkage_value > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_id',p_shrinkage_expense_account_id,'debit',v_total_shrinkage_value,'credit',0,'memo','Selisih opname (kurang) '||s.period_label),
        jsonb_build_object('account_id',p_inventory_asset_account_id,'debit',0,'credit',v_total_shrinkage_value,'memo','Penyesuaian persediaan (kurang) '||s.period_label)
      );
    end if;
    if v_total_overage_value > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_id',p_inventory_asset_account_id,'debit',v_total_overage_value,'credit',0,'memo','Penyesuaian persediaan (lebih) '||s.period_label),
        jsonb_build_object('account_id',p_overage_gain_account_id,'debit',0,'credit',v_total_overage_value,'memo','Selisih opname (lebih) '||s.period_label)
      );
    end if;
    select public.trace_post_balanced_journal(
      s.organization_id, p_entry_date, 'inventory_opname', s.id::text,
      'Penyesuaian stock opname '||s.period_label, 'adjustment', v_lines
    ) into v_journal_id;
  end if;

  update public.trace_inventory_opname_sessions
  set status='posted', version=version+1, posted_at=now(), updated_at=now()
  where id=p_session_id and version=p_expected_version
  returning * into s;
  if not found then raise exception 'TRACE_OPNAME_CONCURRENT_UPDATE'; end if;

  perform public.trace_append_audit_event('post','inventory_opname_session',s.id::text,null,
    jsonb_build_object('journal_id',v_journal_id,'shrinkage_value',v_total_shrinkage_value,'overage_value',v_total_overage_value),null);
  return s;
end; $$;
revoke all on function public.trace_post_opname_session(uuid,bigint,uuid,uuid,uuid,date) from public;
grant execute on function public.trace_post_opname_session(uuid,bigint,uuid,uuid,uuid,date) to authenticated;

-- ============================================================
-- 2. RPC — laporan riwayat & ringkasan varians opname
-- ============================================================
create or replace function public.trace_opname_history_report(p_client_id text,p_outlet_id text default null,p_limit int default 24)
returns table(
  session_id uuid, period_label text, status text, opened_at timestamptz, posted_at timestamptz,
  total_lines int, lines_with_variance int, total_shrinkage_value numeric, total_overage_value numeric, net_variance_value numeric
)
language sql stable security definer set search_path=public as $$
  select s.id, s.period_label, s.status, s.opened_at, s.posted_at,
    count(l.id)::int as total_lines,
    count(l.id) filter (where coalesce(l.variance_qty,0) <> 0)::int as lines_with_variance,
    coalesce(sum(l.variance_value) filter (where l.variance_value < 0),0) * -1 as total_shrinkage_value,
    coalesce(sum(l.variance_value) filter (where l.variance_value > 0),0) as total_overage_value,
    coalesce(sum(l.variance_value),0) as net_variance_value
  from public.trace_inventory_opname_sessions s
  left join public.trace_inventory_opname_lines l on l.session_id = s.id
  where public.trace_is_team_member()
    and s.organization_id = trim(p_client_id)
    and (p_outlet_id is null or s.outlet_id is not distinct from p_outlet_id)
  group by s.id
  order by s.opened_at desc
  limit p_limit;
$$;
revoke all on function public.trace_opname_history_report(text,text,int) from public;
grant execute on function public.trace_opname_history_report(text,text,int) to authenticated;

-- Rincian varians per item lintas sesi (untuk deteksi item "bocor" berulang)
create or replace function public.trace_opname_item_variance_trend(p_client_id text,p_item_id uuid,p_limit int default 12)
returns table(session_id uuid, period_label text, expected_qty numeric, counted_qty numeric, variance_qty numeric, variance_value numeric, variance_reason_code text)
language sql stable security definer set search_path=public as $$
  select s.id, s.period_label, l.expected_qty, l.counted_qty, l.variance_qty, l.variance_value, l.variance_reason_code
  from public.trace_inventory_opname_lines l
  join public.trace_inventory_opname_sessions s on s.id = l.session_id
  where public.trace_is_team_member()
    and s.organization_id = trim(p_client_id)
    and l.item_id = p_item_id
  order by s.opened_at desc
  limit p_limit;
$$;
revoke all on function public.trace_opname_item_variance_trend(text,uuid,int) from public;
grant execute on function public.trace_opname_item_variance_trend(text,uuid,int) to authenticated;
