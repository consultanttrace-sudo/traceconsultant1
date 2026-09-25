import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FinanceEvidence, FinanceRecord, FinanceStatementSection } from '../core/finance';
import {
  buildClientHealth, buildInsight, buildMarginTrend, buildPriorityList, periodsOf, readTrend, summarizePortfolio,
  type ClientHealthRow, type MarginTrendPoint, type PortfolioAlertInput, type PortfolioClientInput, type PortfolioInsight, type PortfolioSummary, type TrendReading, type ClientDriver
} from '../core/portfolioHealth';
import { asArray, loadTraceCollections, requireReactSession } from './views/_shared';
import { useClientScope } from './clientScope';
import { dispatchScope, getScope, useScope } from './scopeStore';
import { isPeriod, reconcileScope } from '../core/scope';
import { diagnoseClient, rollupWorkstreams, summarizePlan, taskDraftFromFinding, WORKSTREAMS, type WorkPlanSummary, type WorkstreamFinding, type WorkstreamRollup, type WorkstreamSignals } from '../core/workstreams';
import { failedSignals, signalsFromRows, SIGNAL_RESOURCES } from '../core/workstreamSignals';
import { buildWorkQueue, normalizePriority, normalizeStatus, type WorkQueue, type WorkTaskInput } from '../core/workQueue';

export type TrendRange = 3 | 6 | 12;
export interface JalurModel {
  /** Set when one client is selected: that client's own plan. */
  selected: { name: string; plan: WorkPlanSummary; ok: WorkstreamFinding[]; nodata: WorkstreamFinding[] } | null;
  /** Portfolio view: which jalur are needed by how many clients. */
  rollup: WorkstreamRollup[];
  manual: Array<{ label: string; hint: string }>;
}
export interface PortfolioLoaded extends PortfolioClientInput { tasks: WorkTaskInput[]; tasksUnavailable: boolean }
export interface PortfolioFilters { clientId: string; period: string; range: TrendRange }
export type PortfolioPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface PortfolioValue {
  phase: PortfolioPhase;
  error: string;
  progress: { done: number; total: number };
  clients: Array<{ id: string; name: string }>;
  filters: PortfolioFilters;
  setFilters: (patch: Partial<PortfolioFilters>) => void;
  periodOptions: string[];
  periodLabel: string;
  allRows: ClientHealthRow[];
  scopeRows: ClientHealthRow[];
  summary: PortfolioSummary;
  allSummary: PortfolioSummary;
  trend: MarginTrendPoint[];
  reading: TrendReading | null;
  insight: PortfolioInsight;
  priority: Array<{ row: ClientHealthRow; driver: ClientDriver }>;
  queue: WorkQueue;
  tasksUnavailable: number;
  jalur: JalurModel;
  selectedClientName: string;
  reload: () => void;
  notify: (message: string) => void;
  /** Ubah satu temuan jalur kerja (menyala atau perlu asesmen manual) menjadi tugas nyata di trace_collaboration_tasks. */
  createWorkstreamTask: (clientId: string, finding: WorkstreamFinding) => Promise<{ ok: boolean; message: string }>;
}

const Ctx = createContext<PortfolioValue | null>(null);
export const usePortfolio = () => useContext(Ctx);

const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const periodLongLabel = (p: string) => {
  const m = Number(p.slice(5, 7));
  return m >= 1 && m <= 12 ? `${MONTHS_LONG[m - 1]} ${p.slice(0, 4)}` : p;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const CLIENT_CAP = 40;
/** Data operasional mentah SATU klien untuk sinyal jalur kerja; hanya dimuat saat satu klien dipilih. */
interface SignalRaw { clientId: string; fetchedAtIso: string; data: Record<string, unknown>; unavailable: string[]; error: string | null }
const CONCURRENCY = 4;

function readUrlFilters(): PortfolioFilters {
  const q = new URLSearchParams(location.search);
  const r = Number(q.get('range'));
  return { clientId: '', period: '', range: r === 3 || r === 6 ? r : 12 };
}

function writeUrlFilters(f: PortfolioFilters) {
  const u = new URL(location.href);
  const set = (k: string, v: string, keep: boolean) => (keep ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  set('range', String(f.range), f.range !== 12);
  history.replaceState(null, '', `${u.pathname}${u.search}`);
}

async function loadOne(client: { id: string; name: string }): Promise<PortfolioLoaded> {
  try {
    const { data, unavailable } = await loadTraceCollections([], ['finance', 'alerts', 'tasks'], client.id);
    const records: FinanceRecord[] = asArray(data.finance)
      .filter(isObj)
      .filter(r => r.client_id === undefined || r.client_id === null || String(r.client_id) === client.id)
      .map(r => ({
        id: String(r.id), period: String(r.period), amount: Number(r.amount), category: r.category as FinanceRecord['category'],
        outletId: r.outlet_id ? String(r.outlet_id) : undefined,
        evidence: r.evidence_source ? { id: String(r.id), source: r.evidence_source as FinanceEvidence['source'], sourceRef: r.evidence_note ? String(r.evidence_note) : undefined } : undefined,
        accountLabel: r.account_label ? String(r.account_label) : undefined,
        statementSection: r.statement_section as FinanceStatementSection | undefined
      }))
      .filter(r => Number.isFinite(r.amount) && !!r.period);
    const alerts: PortfolioAlertInput[] = asArray(data.alerts)
      .filter(isObj)
      .filter(a => !a.organization_id || String(a.organization_id) === client.id)
      .map(a => ({ id: String(a.id), severity: String(a.severity ?? ''), title: String(a.title ?? 'Alert'), status: String(a.status ?? ''), createdAt: a.created_at ? String(a.created_at) : null }));
    const tasks: WorkTaskInput[] = asArray(data.tasks)
      .filter(isObj)
      .filter(t => t.client_id === undefined || t.client_id === null || String(t.client_id) === client.id)
      .map(t => ({ id: String(t.id), clientId: client.id, clientName: client.name, title: String(t.title ?? 'Tugas'), status: normalizeStatus(t.status), priority: normalizePriority(t.priority), dueDate: t.due_date ? String(t.due_date) : null }));
    const financeMissing = unavailable.some(k => String(k) === 'finance');
    return { id: client.id, name: client.name, records, alerts, tasks, tasksUnavailable: unavailable.some(k => String(k) === 'tasks'), loadError: financeMissing ? 'Data finance tidak tersedia untuk klien ini' : null };
  } catch (e) {
    return { id: client.id, name: client.name, records: [], alerts: [], tasks: [], tasksUnavailable: true, loadError: e instanceof Error ? e.message : 'Gagal memuat data klien' };
  }
}

export function PortfolioProvider({ enabled, onNotify, children }: { enabled: boolean; onNotify: (message: string) => void; children: ReactNode }) {
  const [phase, setPhase] = useState<PortfolioPhase>('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [inputs, setInputs] = useState<PortfolioLoaded[]>([]);
  const [clientList, setClientList] = useState<Array<{ id: string; name: string }>>([]);
  const [scopeClient] = useClientScope();
  const { period: scopePeriod } = useScope();
  const [allClientIds, setAllClientIds] = useState<string[] | null>(null);
  const [filters, setFiltersState] = useState<PortfolioFilters>(readUrlFilters);
  const [nonce, setNonce] = useState(0);
  const [signalRaw, setSignalRaw] = useState<SignalRaw | null>(null);
  const started = useRef(-1);
  const listRef = useRef<Promise<Array<{ id: string; name: string }>> | null>(null);

  // The client list is one cheap request, needed by the top-bar chip on every page; the heavy per-client load waits for `enabled`.
  const getList = useCallback(() => {
    if (!listRef.current) {
      listRef.current = loadTraceCollections(['trace-clients'])
        .then(list => asArray(list.data['trace-clients']).filter(isObj).map(c => ({ id: String(c.id), name: String(c.name ?? c.business_name ?? c.id) })))
        .catch(e => { listRef.current = null; throw e; });
    }
    return listRef.current;
  }, []);

  useEffect(() => {
    let alive = true;
    getList().then(l => { if (alive) { setClientList(l.slice(0, CLIENT_CAP)); setAllClientIds(l.map(c => c.id)); } }).catch(() => { /* chip stays hidden; the Overview reports the error itself */ });
    return () => { alive = false; };
  }, [getList, nonce]);

  // A client id from a stale link/bookmark that is not in the FULL client list is cleared from the shared scope for ALL modules
  // (together with its outlet) instead of every module silently loading an empty client.
  useEffect(() => {
    if (!allClientIds) return;
    const { dropped } = reconcileScope(getScope(), { clientIds: allClientIds });
    if (dropped.includes('client')) {
      dispatchScope({ type: 'client', clientId: '' });
      onNotify('Klien pada link tidak ditemukan — filter klien dibersihkan.');
    }
  }, [allClientIds, scopeClient, onNotify]);

  useEffect(() => {
    if (!enabled || started.current === nonce) return;
    started.current = nonce;
    let alive = true;
    setPhase('loading'); setError(''); setProgress({ done: 0, total: 0 });
    (async () => {
      try {
        const clients = (await getList()).slice(0, CLIENT_CAP);
        if (!alive) return;
        setProgress({ done: 0, total: clients.length });
        const out: PortfolioLoaded[] = new Array(clients.length);
        let next = 0, done = 0;
        const worker = async () => {
          while (alive) {
            const i = next++;
            if (i >= clients.length) return;
            out[i] = await loadOne(clients[i]);
            done += 1;
            if (alive) setProgress({ done, total: clients.length });
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, clients.length) }, worker));
        if (!alive) return;
        setInputs(out);
        setPhase('ready');
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Data TRACE tidak tersedia.');
        setPhase('error');
      }
    })();
    return () => { alive = false; started.current = -1; };
  }, [enabled, nonce, getList]);

  const clients = useMemo(() => (inputs.length ? inputs.map(c => ({ id: c.id, name: c.name })) : clientList), [inputs, clientList]);
  // A client id from a stale link that no longer exists must not silently empty the dashboard.
  const clientId = scopeClient && (clients.length === 0 || clients.some(c => c.id === scopeClient)) ? scopeClient : '';
  // The period is the ONE global period shared with every module; a chosen month without data stays selectable so the
  // Overview says "Data belum cukup" for it instead of quietly showing another month.
  const period = isPeriod(scopePeriod) ? scopePeriod : '';
  // Sinyal otomatis (inventory/POS/sosial/AR-AP) hanya untuk klien yang dipilih: memuat semua klien sekaligus akan menambah
  // beban query dan mencampur data antar-klien di satu layar. Tanpa klien terpilih, jalur tetap dari finance saja.
  useEffect(() => {
    if (phase !== 'ready' || !clientId) { setSignalRaw(null); return; }
    let alive = true;
    setSignalRaw(null);
    const fetchedAtIso = new Date().toISOString();
    loadTraceCollections([], SIGNAL_RESOURCES, clientId)
      .then(({ data, unavailable }) => { if (alive) setSignalRaw({ clientId, fetchedAtIso, data, unavailable, error: null }); })
      .catch(e => { if (alive) setSignalRaw({ clientId, fetchedAtIso, data: {}, unavailable: [], error: e instanceof Error ? e.message : 'Gagal memuat data operasional klien' }); });
    return () => { alive = false; };
  }, [phase, clientId, nonce]);

  // Periode global hanya menggeser jendela POS/inventory; data mentah tidak dimuat ulang saat periode berganti.
  const signals = useMemo<WorkstreamSignals | undefined>(() => {
    if (!signalRaw || signalRaw.clientId !== clientId) return undefined;
    if (signalRaw.error) return failedSignals(signalRaw.error);
    return signalsFromRows({ clientId, data: signalRaw.data, unavailable: signalRaw.unavailable, period, nowIso: signalRaw.fetchedAtIso });
  }, [signalRaw, clientId, period]);

  const periodOptions = useMemo(() => [...new Set([...inputs.flatMap(c => periodsOf(c.records)), ...(period ? [period] : [])])].sort().reverse(), [inputs, period]);

  const model = useMemo(() => {
    const allRows = inputs.map(c => buildClientHealth(c, period || null));
    const scopeRows = clientId ? allRows.filter(r => r.id === clientId) : allRows;
    const scopeInputs = clientId ? inputs.filter(c => c.id === clientId) : inputs;
    const summary = summarizePortfolio(scopeRows);
    const trend = buildMarginTrend(scopeInputs, filters.range);
    const queue = buildWorkQueue(scopeInputs.flatMap(c => c.tasks), scopeInputs.map(c => ({ id: c.id, name: c.name })), new Date(), 6);
    const scopeIdx = inputs.map((c, i) => ({ c, i })).filter(x => !clientId || x.c.id === clientId);
    const perClient = scopeIdx.map(({ c, i }) => ({ id: c.id, name: c.name, findings: diagnoseClient(allRows[i], c.records, c.id === clientId ? signals : undefined) }));
    const one = clientId && perClient[0] ? perClient[0] : null;
    const jalur: JalurModel = {
      selected: one ? { name: one.name, plan: summarizePlan(one.findings), ok: one.findings.filter(f => f.status === 'ok'), nodata: one.findings.filter(f => f.status === 'nodata') } : null,
      rollup: rollupWorkstreams(perClient),
      manual: WORKSTREAMS.filter(w => !w.auto).map(w => ({ label: w.label, hint: w.manualHint }))
    };
    return { jalur, allRows, scopeRows, summary, allSummary: summarizePortfolio(allRows), trend, reading: readTrend(trend, 3), insight: buildInsight(summary), priority: buildPriorityList(scopeRows, 4), queue, tasksUnavailable: scopeInputs.filter(c => c.tasksUnavailable).length };
  }, [inputs, clientId, period, filters.range, signals]);

  const setFilters = useCallback((patch: Partial<PortfolioFilters>) => {
    if (patch.clientId !== undefined) dispatchScope({ type: 'client', clientId: patch.clientId });
    if (patch.period !== undefined) dispatchScope({ type: 'period', period: patch.period });
    const { clientId: _ignored, period: _ignoredPeriod, ...rest } = patch;
    if (Object.keys(rest).length) setFiltersState(prev => { const next = { ...prev, ...rest }; writeUrlFilters(next); return next; });
  }, []);
  const reload = useCallback(() => { listRef.current = null; setNonce(n => n + 1); }, []);

  const createWorkstreamTask = useCallback(async (targetClientId: string, finding: WorkstreamFinding) => {
    const draft = taskDraftFromFinding(finding, new Date().toISOString());
    if (!draft) return { ok: false, message: 'Jalur ini tidak bisa dijadikan tugas (belum ada temuan yang menyala).' };
    try {
      const supabase = await requireReactSession();
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Session Supabase tidak tersedia.');
      const { data, error: e } = await supabase.rpc('trace_create_workstream_task', {
        p_client_id: targetClientId,
        p_workstream_key: draft.workstreamKey,
        p_title: draft.title,
        p_owner_user_id: user.id,
        p_priority: draft.priority,
        p_due_date: draft.dueDateIso,
        p_evidence_note: draft.evidenceNote
      });
      if (e) throw e;
      const clientName = clients.find(c => c.id === targetClientId)?.name ?? targetClientId;
      const newTask: WorkTaskInput = {
        id: String((data as { id?: unknown } | null)?.id ?? `local-${Date.now()}`),
        clientId: targetClientId, clientName, title: draft.title, status: 'open', priority: draft.priority, dueDate: draft.dueDateIso
      };
      setInputs(prev => prev.map(c => (c.id === targetClientId ? { ...c, tasks: [...c.tasks, newTask] } : c)));
      const dueLabelText = new Date(draft.dueDateIso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return { ok: true, message: `Tugas dibuat: "${draft.title}" · tenggat ${dueLabelText} · lihat di Business Twin / Antrean Kerja.` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Tugas gagal dibuat.' };
    }
  }, [clients]);

  const value: PortfolioValue = {
    phase, error, progress, clients,
    filters: { ...filters, clientId, period },
    setFilters, periodOptions,
    periodLabel: period ? periodLongLabel(period) : 'periode terbaru per klien',
    ...model,
    selectedClientName: clients.find(c => c.id === clientId)?.name ?? '',
    reload, notify: onNotify, createWorkstreamTask
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
