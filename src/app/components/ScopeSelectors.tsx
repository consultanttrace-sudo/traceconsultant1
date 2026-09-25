import { useEffect, useId, useMemo, useState } from 'react';
import { outletOptionsForClient, type OutletOption, type PeriodFallback } from '../../core/scope';
import { useOutletScope, usePeriodScope } from '../scopeStore';
import { asArray, inputStyle, loadTraceCollections } from '../views/_shared';

/**
 * Period + outlet controls for every module. They read/write the ONE global scope, so choosing a
 * period or outlet in any module (or in the top bar) is reflected everywhere.
 * Modules opt in with the fallback that suits them (see core/scope.ts → PeriodFallback).
 */

/* ---------------------------------------------------------------- outlet suggestions */

type Hierarchy = { companies: unknown[]; brands: unknown[]; outlets: unknown[] };
let hierarchyPromise: Promise<Hierarchy> | null = null;

/** Company → Brand → Outlet metadata is global (no client payload); load once and reuse. */
function loadHierarchy(): Promise<Hierarchy> {
  if (!hierarchyPromise) {
    hierarchyPromise = loadTraceCollections(['trace-companies', 'trace-brands', 'trace-outlets'])
      .then(r => ({ companies: asArray(r.data['trace-companies']), brands: asArray(r.data['trace-brands']), outlets: asArray(r.data['trace-outlets']) }))
      .catch(e => { hierarchyPromise = null; throw e; });
  }
  return hierarchyPromise;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/**
 * Outlet suggestions for one client. `loaded` is false until the hierarchy answered, so callers can tell
 * "no outlets known" from "still loading". Failure is reported as `failed`, never as an empty list.
 */
export function useOutletOptions(clientId: string, dataOutletIds: readonly string[] = []): { options: OutletOption[]; loaded: boolean; failed: boolean } {
  const [hierarchy, setHierarchy] = useState<Hierarchy | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadHierarchy().then(h => { if (alive) { setHierarchy(h); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [clientId]);
  const dataKey = dataOutletIds.join('|');
  const options = useMemo(() => outletOptionsForClient({
    clientId,
    companies: hierarchy?.companies.filter(isObj),
    brands: hierarchy?.brands.filter(isObj),
    outlets: hierarchy?.outlets.filter(isObj),
    dataOutletIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [clientId, hierarchy, dataKey]);
  return { options, loaded: hierarchy !== null, failed };
}

/* ---------------------------------------------------------------- period */

export function PeriodSelector({ label = 'Periode', fallback, available, style }: {
  label?: string;
  /** 'current' for input screens, 'latest' for report screens, 'none' when the module has its own default */
  fallback: PeriodFallback;
  /** Periods that have data. When given, the control is a list of real periods instead of a free month picker. */
  available?: readonly string[];
  style?: React.CSSProperties;
}) {
  const ps = usePeriodScope(fallback, available);
  if (available) {
    const options = [...new Set(available)].sort().reverse();
    const missing = !!ps.scopePeriod && !options.includes(ps.scopePeriod);
    return (
      <label>{label}
        <select value={ps.scopePeriod} onChange={e => ps.set(e.target.value)} style={style ?? inputStyle}>
          <option value="">{ps.period ? `Terbaru (${ps.period})` : 'Belum ada data'}</option>
          {missing && <option value={ps.scopePeriod}>{ps.scopePeriod} — belum ada data</option>}
          {options.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label>{label}
      <input type="month" value={ps.scopePeriod || (fallback === 'current' ? ps.period : '')} onChange={e => ps.set(e.target.value)} style={style ?? inputStyle} />
    </label>
  );
}

/* ---------------------------------------------------------------- outlet */

export function OutletSelector({ clientId, label = 'Outlet (opsional)', placeholder = 'Semua outlet / pusat', dataOutletIds, style }: {
  clientId: string;
  label?: string;
  placeholder?: string;
  /** Outlet ids already present in this client's own loaded rows (never another client's). */
  dataOutletIds?: readonly string[];
  style?: React.CSSProperties;
}) {
  const [outletId, setOutlet] = useOutletScope();
  const { options, loaded, failed } = useOutletOptions(clientId, dataOutletIds);
  const listId = useId();
  const [draft, setDraft] = useState(outletId);
  useEffect(() => { setDraft(outletId); }, [outletId]);

  // Commit on pick / Enter / blur, not on every keystroke: modules refetch when the outlet changes.
  const commit = (value: string) => { const v = value.trim(); if (v !== outletId) setOutlet(v); };
  const known = options.some(o => o.id === outletId);
  let hint = '';
  if (!clientId) hint = 'Pilih klien dulu.';
  else if (outletId && loaded && !known) hint = 'ID ini belum ada di daftar outlet klien ini — pastikan benar.';
  else if (failed) hint = 'Daftar outlet gagal dimuat; ketik ID outlet bila perlu.';
  else if (loaded && options.length === 0) hint = 'Belum ada daftar outlet untuk klien ini; ketik ID outlet bila perlu.';

  return (
    <label>{label}
      <input
        list={listId} value={draft} disabled={!clientId} placeholder={placeholder} style={style ?? inputStyle}
        onChange={e => { const v = e.target.value; setDraft(v); if (options.some(o => o.id === v)) commit(v); }}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit((e.target as HTMLInputElement).value); } }}
      />
      <datalist id={listId}>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</datalist>
      {hint && <span className="trace-muted" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>{hint}</span>}
    </label>
  );
}
