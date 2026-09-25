/**
 * Global working scope shared by every module: which client, which outlet, which period.
 * Pure functions only (no DOM, no React) so the rules can be tested by behaviour:
 *  - the outlet belongs to exactly one client, so it is dropped whenever the client changes;
 *  - the period is a plain time filter, so it survives a client change;
 *  - values coming from the URL are never trusted (bad period / outlet without client are ignored);
 *  - stale ids (client no longer in the list) are reconciled away instead of silently loading nothing.
 */
export interface ScopeState { clientId: string; outletId: string; period: string }

export const EMPTY_SCOPE: ScopeState = { clientId: '', outletId: '', period: '' };

export type ScopeAction =
  | { type: 'client'; clientId: string }
  | { type: 'outlet'; outletId: string }
  | { type: 'period'; period: string }
  | { type: 'set'; patch: Partial<ScopeState> }
  | { type: 'reset' };

/** YYYY-MM with a real month (01–12). */
export function isPeriod(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Normalise a period coming from a user/URL: valid → itself, anything else → ''. */
export function cleanPeriod(value: unknown): string {
  return isPeriod(value) ? value : '';
}

/** Move a period by n months (n may be negative). Invalid input → ''. */
export function shiftPeriod(period: string, months: number): string {
  if (!isPeriod(period)) return '';
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + Math.trunc(months);
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}`;
}

export const previousPeriod = (period: string): string => shiftPeriod(period, -1);

/** The last `count` calendar months (newest first), plus `include` when it is a valid period not already listed. For pickers without data lists (top bar). */
export function recentPeriods(now: Date = new Date(), count = 24, include = ''): string[] {
  const cur = currentPeriod(now);
  const list = Array.from({ length: Math.max(0, count) }, (_, i) => shiftPeriod(cur, -i));
  if (isPeriod(include) && !list.includes(include)) list.push(include);
  return list.sort().reverse();
}

/** Current calendar month in UTC (matches the existing `new Date().toISOString().slice(0, 7)` defaults). */
export function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * How a module wants to fall back when the user has not picked a period:
 *  - 'current': this calendar month (input-style modules: KPI, OPEX, target planner)
 *  - 'latest' : newest period that actually has data (report-style modules: diagnosis, cash flow, health)
 *  - 'none'   : nothing (module shows its own empty state)
 */
export type PeriodFallback = 'current' | 'latest' | 'none';

export interface ResolvedPeriod {
  period: string;
  /** 'scope' = the user's global choice, 'default' = module fallback, 'none' = nothing to show */
  source: 'scope' | 'default' | 'none';
  /** Only meaningful for data-driven modules: false when the chosen period has no rows. */
  hasData: boolean | null;
}

export function resolvePeriod(scopePeriod: string, fallback: PeriodFallback, opts: { now?: Date; available?: readonly string[] } = {}): ResolvedPeriod {
  const available = (opts.available ?? []).filter(isPeriod);
  const knowsData = opts.available !== undefined;
  if (isPeriod(scopePeriod)) {
    return { period: scopePeriod, source: 'scope', hasData: knowsData ? available.includes(scopePeriod) : null };
  }
  if (fallback === 'current') {
    const p = currentPeriod(opts.now);
    return { period: p, source: 'default', hasData: knowsData ? available.includes(p) : null };
  }
  if (fallback === 'latest') {
    const latest = [...available].sort().at(-1) ?? '';
    return latest ? { period: latest, source: 'default', hasData: true } : { period: '', source: 'none', hasData: null };
  }
  return { period: '', source: 'none', hasData: null };
}

export function reduceScope(state: ScopeState, action: ScopeAction): ScopeState {
  switch (action.type) {
    case 'client': {
      const clientId = (action.clientId ?? '').trim();
      if (clientId === state.clientId) return state;
      return { clientId, outletId: '', period: state.period };
    }
    case 'outlet': {
      const outletId = (action.outletId ?? '').trim();
      // an outlet only means something inside a client
      if (!state.clientId && outletId) return state;
      return outletId === state.outletId ? state : { ...state, outletId };
    }
    case 'period': {
      const raw = typeof action.period === 'string' ? action.period.trim() : '';
      // '' clears the choice; a non-empty but invalid value (half-typed month, bad link) is rejected and the current choice kept
      if (raw !== '' && !isPeriod(raw)) return state;
      return raw === state.period ? state : { ...state, period: raw };
    }
    case 'set': {
      // client first so the outlet reset rule applies, then outlet/period on top of the new client
      let next = state;
      if (action.patch.clientId !== undefined) next = reduceScope(next, { type: 'client', clientId: action.patch.clientId });
      if (action.patch.outletId !== undefined) next = reduceScope(next, { type: 'outlet', outletId: action.patch.outletId });
      if (action.patch.period !== undefined) next = reduceScope(next, { type: 'period', period: action.patch.period });
      return next;
    }
    case 'reset':
      return state.clientId || state.outletId || state.period ? EMPTY_SCOPE : state;
  }
}

/** Read the scope from a URL query string. Anything invalid is dropped, not repaired. */
export function parseScope(search: string): ScopeState {
  const q = new URLSearchParams(search);
  const clientId = (q.get('client') ?? '').trim();
  const outletId = clientId ? (q.get('outlet') ?? '').trim() : '';
  return { clientId, outletId, period: cleanPeriod(q.get('period') ?? '') };
}

/** Write the scope into a query string, leaving every unrelated parameter (view, range, …) untouched. */
export function writeScope(search: string, scope: ScopeState): string {
  const q = new URLSearchParams(search);
  const put = (key: string, value: string) => { if (value) q.set(key, value); else q.delete(key); };
  put('client', scope.clientId);
  put('outlet', scope.clientId ? scope.outletId : '');
  put('period', scope.period);
  const out = q.toString();
  return out ? `?${out}` : '';
}

/**
 * Drop parts of the scope that no longer exist. `clientIds` must be the FULL loaded client list
 * (pass null while it is still loading so nothing is cleared prematurely).
 * `outletIds` is optional: only pass it when the outlet list for that client is authoritative.
 */
export function reconcileScope(scope: ScopeState, known: { clientIds: readonly string[] | null; outletIds?: readonly string[] | null }): { scope: ScopeState; dropped: Array<'client' | 'outlet'> } {
  const dropped: Array<'client' | 'outlet'> = [];
  let next = scope;
  if (known.clientIds && next.clientId && !known.clientIds.includes(next.clientId)) {
    next = { clientId: '', outletId: '', period: next.period };
    dropped.push('client');
  }
  if (next.outletId && known.outletIds && !known.outletIds.includes(next.outletId)) {
    next = { ...next, outletId: '' };
    dropped.push('outlet');
  }
  return { scope: next, dropped };
}

/* ------------------------------------------------------------------ outlet suggestions */

export interface OutletOption { id: string; label: string; source: 'hierarchy' | 'data' }

interface KvCompany { id?: unknown; nama?: unknown; name?: unknown; klienId?: unknown; clientId?: unknown }
interface KvBrand { id?: unknown; nama?: unknown; name?: unknown; companyId?: unknown }
interface KvOutlet { id?: unknown; nama?: unknown; name?: unknown; brandId?: unknown; clientId?: unknown; client_id?: unknown }

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/**
 * Outlet suggestions for ONE client. Three honest sources, nothing invented:
 *  1. rows from the real trace_outlets table (client_id set directly on the row) — the normal case;
 *  2. the legacy Company → Brand → Outlet KV hierarchy, for any outlet whose company points at exactly
 *     this client (kept for backward compatibility; that hierarchy was never actually populated in
 *     production, which is exactly why (1) exists);
 *  3. outlet ids that already appear in this client's own (already client-scoped) rows.
 * Outlets of any other client can never appear: table/hierarchy rows are matched by client id, data ids
 * are supplied by the caller from a client-scoped load.
 */
export function outletOptionsForClient(input: {
  clientId: string;
  companies?: readonly KvCompany[];
  brands?: readonly KvBrand[];
  outlets?: readonly KvOutlet[];
  dataOutletIds?: readonly string[];
}): OutletOption[] {
  const clientId = str(input.clientId);
  if (!clientId) return [];
  const companyIds = new Set((input.companies ?? []).filter(c => str(c.klienId ?? c.clientId) === clientId).map(c => str(c.id)).filter(Boolean));
  const brands = (input.brands ?? []).filter(b => companyIds.has(str(b.companyId)));
  const brandById = new Map(brands.map(b => [str(b.id), b]));
  const out: OutletOption[] = [];
  const seen = new Set<string>();
  for (const o of input.outlets ?? []) {
    const id = str(o.id);
    if (!id || seen.has(id)) continue;
    const name = str(o.nama ?? o.name) || id;
    const directClientId = str(o.clientId ?? o.client_id);
    if (directClientId) {
      // real trace_outlets row: trust client_id straight off the row, no brand chain needed.
      if (directClientId !== clientId) continue;
      seen.add(id);
      out.push({ id, label: name, source: 'hierarchy' });
      continue;
    }
    const brand = brandById.get(str(o.brandId));
    if (!brand) continue;
    seen.add(id);
    const brandName = str(brand.nama ?? brand.name);
    out.push({ id, label: brandName ? `${name} · ${brandName}` : name, source: 'hierarchy' });
  }
  for (const raw of input.dataOutletIds ?? []) {
    const id = str(raw).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: id, source: 'data' });
  }
  return out;
}

/* ------------------------------------------------------------------ deep links */

/** Destination = module + scope. Used so every clickable number can carry client [+ outlet] [+ period] with it. */
export interface DeepLink { moduleId: string; clientId?: string; outletId?: string; period?: string }

/** The scope patch a deep link implies. A link that names a client but no outlet clears any previous outlet. */
export function scopePatchForLink(link: DeepLink): Partial<ScopeState> {
  const patch: Partial<ScopeState> = {};
  if (link.clientId !== undefined) patch.clientId = link.clientId;
  if (link.outletId !== undefined) patch.outletId = link.outletId;
  if (link.period !== undefined) patch.period = link.period;
  return patch;
}
