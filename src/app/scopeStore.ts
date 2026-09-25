import { useMemo, useSyncExternalStore } from 'react';
import {
  EMPTY_SCOPE, parseScope, previousPeriod, reduceScope, resolvePeriod, writeScope,
  type PeriodFallback, type ResolvedPeriod, type ScopeAction, type ScopeState
} from '../core/scope';

/**
 * The one working scope (client, outlet, period) shared by every module and the top bar,
 * mirrored in the URL as ?client= &outlet= &period= so a link reproduces the same view.
 * All rules (outlet resets with the client, bad URL values are ignored, …) live in core/scope.ts.
 * Data is still fetched per client through the scoped API — nothing here mixes clients.
 */
let state: ScopeState = typeof location === 'undefined' ? EMPTY_SCOPE : parseScope(location.search);
const listeners = new Set<() => void>();

export const getScope = (): ScopeState => state;

function syncUrl() {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  history.replaceState(null, '', `${location.pathname}${writeScope(location.search, state)}`);
}

export function dispatchScope(action: ScopeAction): void {
  const next = reduceScope(state, action);
  if (next === state) return;
  state = next;
  syncUrl();
  listeners.forEach(l => l());
}

export const setScope = (patch: Partial<ScopeState>) => dispatchScope({ type: 'set', patch });
export const resetScope = () => dispatchScope({ type: 'reset' });

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useScope(): ScopeState {
  return useSyncExternalStore(subscribe, getScope, getScope);
}

/** Test/bootstrap hook: replace the whole state from a query string (e.g. after a popstate). */
export function loadScopeFromUrl(search: string): void {
  const next = parseScope(search);
  if (next.clientId === state.clientId && next.outletId === state.outletId && next.period === state.period) return;
  state = next;
  listeners.forEach(l => l());
}

export interface PeriodScope extends ResolvedPeriod {
  /** what the user explicitly chose ('' = nothing chosen) */
  scopePeriod: string;
  /** the month before `period`, '' when there is no period */
  previous: string;
  set: (period: string) => void;
}

/**
 * Period for a module. Opt-in per module because defaults differ on purpose:
 * pass 'current' for input screens, 'latest' (+ the periods that have data) for report screens.
 * An explicit global choice always wins; the module fallback only applies when nothing was chosen.
 */
export function usePeriodScope(fallback: PeriodFallback, available?: readonly string[]): PeriodScope {
  const { period: scopePeriod } = useScope();
  const key = available ? available.join('|') : null;
  return useMemo(() => {
    const resolved = resolvePeriod(scopePeriod, fallback, { available });
    return { ...resolved, scopePeriod, previous: previousPeriod(resolved.period), set: (p: string) => dispatchScope({ type: 'period', period: p }) };
    // `available` is compared by content through `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopePeriod, fallback, key]);
}

export function useOutletScope(): [string, (id: string) => void] {
  const { outletId } = useScope();
  return [outletId, (id: string) => dispatchScope({ type: 'outlet', outletId: id })];
}
