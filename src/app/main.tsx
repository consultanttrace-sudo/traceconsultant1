import '../styles/tokens.css';
import '../styles/dashboard.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BarChart3, Building2, LayoutDashboard, Users, TriangleAlert, WalletCards, Settings, ShieldCheck, FileCode2, Database, Gauge, Brain, X, Search, ListChecks, ClipboardList, Target, Package, Banknote, Megaphone, BookText, ClipboardCheck, Calculator, Landmark, Waves, Percent } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { type SOP } from '../core/sop';
import { installAcquisitionBridge, getReactSupabase, TraceErrorBoundary, TraceAuthGate } from './views/_shared';
import { PortfolioProvider, usePortfolio } from './portfolio';
import { TraceShell, type FilterChip, type NavGroup } from './components/TraceShell';
import { BusinessHealthView } from './views/BusinessHealthView';
import { OverviewLive } from './views/OverviewLive';
import { LeaderCommandCenterView } from './views/LeaderCommandCenterView';
import { TeamView } from './views/TeamView';
import { GovernanceView } from './views/GovernanceView';
import { AnalyticsView } from './views/AnalyticsView';
import { AcquisitionView } from './views/AcquisitionView';
import { ClientsView } from './views/ClientsView';
import { BusinessTwinView } from './views/BusinessTwinView';
import { InternalDiagnosisView } from './views/InternalDiagnosisView';
import { BusinessDiagnosis } from './views/BusinessDiagnosis';
import { DataRecovery } from './views/DataRecovery';
import { DataIntake } from './views/DataIntake';
import { SettingsCenter } from './views/SettingsCenter';
import { FnbTargetPlanner } from './views/FnbTargetPlanner';
import { InventoryView } from './views/InventoryView';
import { RecipeCogsView } from './views/RecipeCogsView';
import { FinanceEntry } from './views/FinanceEntry';
import { AccountingView } from './views/AccountingView';
import { ChartOfAccountsView } from './views/ChartOfAccountsView';
import { CashFlowView } from './views/CashFlowView';
import { TaxView } from './views/TaxView';
import { SalesView } from './views/SalesView';
import { StockOpnameView } from './views/StockOpnameView';
import { PayrollView } from './views/PayrollView';
import { OpexDetailView } from './views/OpexDetailView';
import { KpiTrackingView } from './views/KpiTrackingView';
import { SopView } from './views/SopView';
import { ActionPlanView } from './views/ActionPlanView';
import { MarketingView } from './views/MarketingView';
import { AICenterView } from './views/AICenterView';
import { dispatchScope, useScope } from './scopeStore';
import { useOutletOptions } from './components/ScopeSelectors';
import { recentPeriods } from '../core/scope';

const nav = [
  ['overview','Overview',LayoutDashboard],['health','Business Health',Gauge],['command','Command Center',Gauge],['recovery','Data Recovery',Database],['team','Team',Users],['governance','Governance',ShieldCheck],['clients','Klien',Users],['acquisition','Acquisition',Target],['business','Business Twin',Building2],['finance','Keuangan',WalletCards],['target','Target & Kapasitas',Target],['inventory','Inventory & Recipe',ClipboardList],['recipecogs','Recipe COGS',Calculator],['opname','Stock Opname',Package],['payroll','Payroll',Banknote],['opex','OPEX Detail',WalletCards],['kpi','KPI Tracking',BarChart3],['sop','SOP',BookText],['actionplan','Action Plan',ClipboardCheck],['marketing','Marketing',Megaphone],['ai','AI Center',Brain],['accounting','Akuntansi',ListChecks],['coa','Chart of Accounts',Landmark],['cashflow','Arus Kas',Waves],['tax','Pajak',Percent],['sales','Penjualan & Dashboard',Activity],['intake','Data Intake',FileCode2],['diagnosis','Diagnosis',TriangleAlert],['internal','Internal Diagnosis',Brain],['analytics','Analytics',BarChart3],['settings','Settings',Settings]
] as const;

// Rail groups. Every nav id must appear in exactly one group (checked by tests_core/test_shell_navigation.mjs).
const groups: NavGroup[] = [
  { id: 'home', label: 'Home', icon: 'home', items: ['overview', 'health', 'command'] },
  { id: 'clients', label: 'Klien', icon: 'users', items: ['clients', 'acquisition', 'business', 'recovery'] },
  { id: 'finance', label: 'Keuangan', icon: 'wallet', items: ['finance', 'accounting', 'coa', 'cashflow', 'tax', 'payroll', 'opex', 'sales'] },
  { id: 'operations', label: 'Operasional', icon: 'cube', items: ['inventory', 'recipecogs', 'opname', 'target', 'kpi', 'sop', 'actionplan', 'marketing'] },
  { id: 'intelligence', label: 'Intelligence', icon: 'chart', items: ['diagnosis', 'internal', 'analytics'] },
  { id: 'ai', label: 'AI', icon: 'sparkle', items: ['ai'] }
];
const footerGroups: NavGroup[] = [
  { id: 'intake', label: 'Data Intake', icon: 'database', items: ['intake'] },
  { id: 'system', label: 'Sistem', icon: 'settings', items: ['settings', 'team', 'governance'] }
];

/** Modules that read the shared client selection (see clientScope.ts). */
const CLIENT_SCOPED = new Set(['health', 'business', 'diagnosis', 'finance', 'accounting', 'coa', 'cashflow', 'payroll', 'opex', 'sales', 'inventory', 'recipecogs', 'opname', 'target', 'kpi', 'sop', 'actionplan', 'marketing', 'team']);

/** Modules that really read the global period / outlet — a chip is shown only where it changes what the page shows. */
const PERIOD_SCOPED = new Set(['health', 'diagnosis', 'cashflow', 'kpi', 'opex', 'target']);
const OUTLET_SCOPED = new Set(['actionplan', 'kpi', 'marketing', 'opex', 'payroll', 'opname', 'target']);

function useSessionEmail() {
  const [email, setEmail] = useState('');
  useEffect(() => {
    const supabase = getReactSupabase();
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setEmail(data.session?.user?.email ?? ''); }).catch(() => { /* avatar falls back to the initial "T" */ });
    return () => { alive = false; };
  }, []);
  return email;
}

function AppShell({ active, choose, openPalette, toast }: { active: string; choose: (id: string) => void; openPalette: () => void; toast: string }) {
  const portfolio = usePortfolio();
  const scope = useScope();
  const outletChip = useOutletOptions(OUTLET_SCOPED.has(active) ? scope.clientId : '');
  const email = useSessionEmail();
  const items = nav.map(([id, label, Icon]) => ({ id, label, icon: <Icon size={17} /> }));
  const title = nav.find(([id]) => id === active)?.[1] ?? 'Overview';
  useEffect(() => { document.title = `${title} · TRACE Consultant OS`; }, [title]);

  let filters: FilterChip[] | undefined;
  if (active === 'overview' && portfolio && portfolio.phase === 'ready' && portfolio.clients.length > 0) {
    filters = [
      { id: 'client', label: 'Semua klien', value: portfolio.filters.clientId, options: [{ value: '', label: 'Semua klien' }, ...portfolio.clients.map(c => ({ value: c.id, label: c.name }))], onChange: v => portfolio.setFilters({ clientId: v }) },
      { id: 'period', label: 'Periode terbaru', value: portfolio.filters.period, options: [{ value: '', label: 'Periode terbaru' }, ...portfolio.periodOptions.map(p => ({ value: p, label: p }))], onChange: v => portfolio.setFilters({ period: v }) },
      { id: 'range', label: '12 bulan', value: String(portfolio.filters.range), options: [{ value: '3', label: '3 bulan terakhir' }, { value: '6', label: '6 bulan terakhir' }, { value: '12', label: '12 bulan terakhir' }], onChange: v => portfolio.setFilters({ range: Number(v) as 3 | 6 | 12 }) }
    ];
  }
  else if (portfolio && CLIENT_SCOPED.has(active) && portfolio.clients.length > 0) {
    filters = [
      { id: 'client', label: 'Pilih klien', value: portfolio.filters.clientId, options: [{ value: '', label: 'Pilih klien' }, ...portfolio.clients.map(c => ({ value: c.id, label: c.name }))], onChange: v => portfolio.setFilters({ clientId: v }) }
    ];
    if (PERIOD_SCOPED.has(active)) {
      filters.push({ id: 'period', label: 'Periode otomatis', value: scope.period, options: [{ value: '', label: 'Periode otomatis' }, ...recentPeriods(new Date(), 24, scope.period).map(p => ({ value: p, label: p }))], onChange: v => dispatchScope({ type: 'period', period: v }) });
    }
    if (OUTLET_SCOPED.has(active) && scope.clientId && outletChip.options.length > 0) {
      const known = outletChip.options.some(o => o.id === scope.outletId);
      filters.push({ id: 'outlet', label: 'Semua outlet', value: scope.outletId, options: [{ value: '', label: 'Semua outlet' }, ...(scope.outletId && !known ? [{ value: scope.outletId, label: scope.outletId }] : []), ...outletChip.options.map(o => ({ value: o.id, label: o.label }))], onChange: v => dispatchScope({ type: 'outlet', outletId: v }) });
    }
  }
  const bell = portfolio?.phase === 'ready' ? portfolio.allSummary.openAlerts : 0;
  const initial = (email || 'T').trim().charAt(0) || 'T';

  return <TraceShell nav={items} groups={groups} footerGroups={footerGroups} active={active} onNavigate={choose} onOpenPalette={openPalette}
    filters={filters} bellCount={bell} onBell={() => choose('health')} avatarInitial={initial} avatarLabel={email || 'Akun TRACE'} toast={toast} contextLabel={active === 'acquisition' ? 'ACQUISITION · INTERNAL' : undefined}>
    <AnimatePresence mode="wait">
      <motion.div key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14 }}>
        {active==='health' ? <BusinessHealthView /> : active==='recovery' ? <DataRecovery /> : active==='finance' ? <FinanceEntry /> : active==='target' ? <FnbTargetPlanner /> : active==='inventory' ? <InventoryView /> : active==='recipecogs' ? <RecipeCogsView /> : active==='opname' ? <StockOpnameView /> : active==='payroll' ? <PayrollView /> : active==='opex' ? <OpexDetailView /> : active==='kpi' ? <KpiTrackingView /> : active==='sop' ? <SopView /> : active==='actionplan' ? <ActionPlanView /> : active==='marketing' ? <MarketingView /> : active==='ai' ? <AICenterView /> : active==='accounting' ? <AccountingView /> : active==='coa' ? <ChartOfAccountsView /> : active==='cashflow' ? <CashFlowView /> : active==='tax' ? <TaxView /> : active==='sales' ? <SalesView /> : active==='intake' ? <DataIntake /> : active==='diagnosis' ? <BusinessDiagnosis /> : active==='internal' ? <InternalDiagnosisView /> : active==='settings' ? <SettingsCenter /> : active==='command' ? <LeaderCommandCenterView /> : active==='team' ? <TeamView /> : active==='governance' ? <GovernanceView /> : active==='analytics' ? <AnalyticsView /> : active==='clients' ? <ClientsView /> : active==='business' ? <BusinessTwinView /> : active==='acquisition' ? <AcquisitionView /> : <OverviewLive onNavigate={choose} />}
      </motion.div>
    </AnimatePresence>
  </TraceShell>;
}


function App(){
  // The legacy monolith (now served only at /legacy-classic.html) used to
  // register this itself; the React shell that actually owns "/" never did,
  // so the PWA install/offline features that sw.js provides were silently
  // inert in production even though the file was being deployed. Register
  // once here so the React app gets the same offline/reliability behavior.
  useEffect(()=>{if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{ /* offline support is a progressive enhancement; ignore failures */ });}},[]);
  useEffect(()=>{void installAcquisitionBridge().catch(()=>{ /* Acquisition remains truthful until a valid authenticated Supabase session exists. */ }); return()=>{ if(window.TRACE_ACQUISITION_BRIDGE) delete window.TRACE_ACQUISITION_BRIDGE; };},[]);
  const initialView=(()=>{const v=new URLSearchParams(location.search).get('view');return ['overview','health','command','recovery','team','governance','clients','acquisition','business','finance','target','inventory','recipecogs','opname','payroll','opex','kpi','sop','actionplan','marketing','ai','accounting','coa','cashflow','tax','sales','intake','diagnosis','internal','analytics','settings'].includes(v||'')?String(v):'overview';})();
  const [active,setActive]=useState(initialView);
  const [overviewVisited,setOverviewVisited]=useState(initialView==='overview');
  const [commandOpen,setCommandOpen]=useState(false);
  const [commandQuery,setCommandQuery]=useState('');
  const [toast,setToast]=useState('');
  const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const notify=useCallback((message:string)=>{setToast(message);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3200);},[]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setCommandOpen(true);setCommandQuery('');}if(e.key==='Escape')setCommandOpen(false)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  const choose=useCallback((id:string)=>{
    setActive(id);setCommandOpen(false);setCommandQuery('');
    if(id==='overview')setOverviewVisited(true);
    const u=new URL(location.href);u.searchParams.set('view',id);
    history.replaceState(null,'',`${u.pathname}${u.search}`);
    document.querySelector('.tr-main')?.scrollTo({top:0});
  },[]);
  const filtered=nav.filter(([,label])=>label.toLowerCase().includes(commandQuery.toLowerCase()));
  return <TraceAuthGate><TraceErrorBoundary>
    <PortfolioProvider enabled={overviewVisited} onNotify={notify}>
      <AppShell active={active} choose={choose} openPalette={()=>{setCommandOpen(true);setCommandQuery('')}} toast={toast}/>
    </PortfolioProvider>
    {commandOpen&&<div className="trace-react-command-overlay" role="dialog" aria-modal="true" aria-label="TRACE Command Palette" onMouseDown={e=>{if(e.target===e.currentTarget)setCommandOpen(false)}}><div className="trace-react-command-box"><div className="trace-react-command-head"><Search size={17}/><input autoFocus value={commandQuery} onChange={e=>setCommandQuery(e.target.value)} placeholder="Cari modul TRACE…"/><button aria-label="Tutup command palette" onClick={()=>setCommandOpen(false)}><X size={17}/></button></div><div className="trace-react-command-list">{filtered.map(([id,label,Icon])=><button key={id} onClick={()=>choose(id)}><Icon size={17}/><span>{label}</span><kbd>↵</kbd></button>)}{filtered.length===0&&<div className="trace-react-command-empty">Modul tidak ditemukan.</div>}</div></div></div>}
  </TraceErrorBoundary></TraceAuthGate>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
