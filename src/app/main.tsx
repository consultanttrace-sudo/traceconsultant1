import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BarChart3, Building2, Command, LayoutDashboard, Users, TriangleAlert, WalletCards, Settings, ShieldCheck, FileCode2, Database, Gauge, Brain, X, Search, ListChecks, ClipboardList, Target, Package, Banknote, Megaphone, BookText, ClipboardCheck, Calculator, Landmark, Waves, Percent } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { type SOP } from '../core/sop';
import { installAcquisitionBridge, TraceErrorBoundary, TraceAuthGate } from './views/_shared';
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

const nav = [
  ['overview','Overview',LayoutDashboard],['health','Business Health',Gauge],['command','Command Center',Gauge],['recovery','Data Recovery',Database],['team','Team',Users],['governance','Governance',ShieldCheck],['clients','Klien',Users],['acquisition','Acquisition',Target],['business','Business Twin',Building2],['finance','Keuangan',WalletCards],['target','Target & Kapasitas',Target],['inventory','Inventory & Recipe',ClipboardList],['recipecogs','Recipe COGS',Calculator],['opname','Stock Opname',Package],['payroll','Payroll',Banknote],['opex','OPEX Detail',WalletCards],['kpi','KPI Tracking',BarChart3],['sop','SOP',BookText],['actionplan','Action Plan',ClipboardCheck],['marketing','Marketing',Megaphone],['ai','AI Center',Brain],['accounting','Akuntansi',ListChecks],['coa','Chart of Accounts',Landmark],['cashflow','Arus Kas',Waves],['tax','Pajak',Percent],['sales','Penjualan & Dashboard',Activity],['intake','Data Intake',FileCode2],['diagnosis','Diagnosis',TriangleAlert],['internal','Internal Diagnosis',Brain],['analytics','Analytics',BarChart3],['settings','Settings',Settings]
] as const;


function App(){
  useEffect(()=>{void installAcquisitionBridge().catch(()=>{ /* Acquisition remains truthful until a valid authenticated Supabase session exists. */ }); return()=>{ if(window.TRACE_ACQUISITION_BRIDGE) delete window.TRACE_ACQUISITION_BRIDGE; };},[]);
  const initialView=(()=>{const v=new URLSearchParams(location.search).get('view');return ['overview','health','command','recovery','team','governance','clients','acquisition','business','finance','target','inventory','recipecogs','opname','payroll','opex','kpi','sop','actionplan','marketing','ai','accounting','coa','cashflow','tax','sales','intake','diagnosis','internal','analytics','settings'].includes(v||'')?String(v):'overview';})();
  const [active,setActive]=useState(initialView);
  const [commandOpen,setCommandOpen]=useState(false);
  const [commandQuery,setCommandQuery]=useState('');
  const title=nav.find(([id])=>id===active)?.[1] ?? 'Overview';
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setCommandOpen(true);setCommandQuery('');}if(e.key==='Escape')setCommandOpen(false)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  const choose=(id:string)=>{setActive(id);setCommandOpen(false);setCommandQuery('');history.replaceState(null,'',`?view=${encodeURIComponent(id)}`)};
  const filtered=nav.filter(([,label])=>label.toLowerCase().includes(commandQuery.toLowerCase()));
  const mobile=nav.filter(([id])=>['overview','health','clients','finance','target','ai','settings'].includes(id));
  return <TraceAuthGate><TraceErrorBoundary><div className="trace-shell">
    <aside className="trace-sidebar"><div className="trace-brand"><div className="trace-brand-mark">T</div><div><div className="trace-brand-name">TRACE</div><div className="trace-muted" style={{fontSize:12,marginTop:2}}>Consultant OS</div></div></div><Tooltip.Provider delayDuration={350}><nav className="trace-nav">{nav.map(([id,label,Icon])=><Tooltip.Root key={id}><Tooltip.Trigger asChild><button data-active={active===id} onClick={()=>choose(id)}><Icon size={16} style={{verticalAlign:'-3px',marginRight:9}}/>{label}</button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="trace-tooltip" side="right" sideOffset={8}>{label}<Tooltip.Arrow className="trace-tooltip-arrow"/></Tooltip.Content></Tooltip.Portal></Tooltip.Root>)}</nav></Tooltip.Provider></aside>
    <main className="trace-main"><header className="trace-topbar"><div><strong>{title}</strong><div className="trace-muted" style={{fontSize:12}}>Business Intelligence · Consulting Workflow</div></div><button className="trace-command" aria-label="Command palette" title="Command palette" onClick={()=>{setCommandOpen(true);setCommandQuery('')}}><Command size={16}/><span className="trace-muted" style={{fontSize:12}}>Command</span></button></header>
    <section className="trace-content"><AnimatePresence mode="wait">
      <motion.div key={active} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.18,ease:[.2,.7,.3,1]}}>
        {active==='health' ? <BusinessHealthView /> : active==='recovery' ? <DataRecovery /> : active==='finance' ? <FinanceEntry /> : active==='target' ? <FnbTargetPlanner /> : active==='inventory' ? <InventoryView /> : active==='recipecogs' ? <RecipeCogsView /> : active==='opname' ? <StockOpnameView /> : active==='payroll' ? <PayrollView /> : active==='opex' ? <OpexDetailView /> : active==='kpi' ? <KpiTrackingView /> : active==='sop' ? <SopView /> : active==='actionplan' ? <ActionPlanView /> : active==='marketing' ? <MarketingView /> : active==='ai' ? <AICenterView /> : active==='accounting' ? <AccountingView /> : active==='coa' ? <ChartOfAccountsView /> : active==='cashflow' ? <CashFlowView /> : active==='tax' ? <TaxView /> : active==='sales' ? <SalesView /> : active==='intake' ? <DataIntake /> : active==='diagnosis' ? <BusinessDiagnosis /> : active==='internal' ? <InternalDiagnosisView /> : active==='settings' ? <SettingsCenter /> : active==='command' ? <LeaderCommandCenterView /> : active==='team' ? <TeamView /> : active==='governance' ? <GovernanceView /> : active==='analytics' ? <AnalyticsView /> : active==='clients' ? <ClientsView /> : active==='business' ? <BusinessTwinView /> : active==='acquisition' ? <AcquisitionView /> : <OverviewLive />}
      </motion.div>
    </AnimatePresence></section>
    <nav className="trace-react-mobile-nav" aria-label="Navigasi cepat mobile">{mobile.map(([id,label,Icon])=><button key={id} className={active===id?'active':''} onClick={()=>choose(id)}><Icon size={18}/><span>{label}</span></button>)}</nav></main>
    {commandOpen&&<div className="trace-react-command-overlay" role="dialog" aria-modal="true" aria-label="TRACE Command Palette" onMouseDown={e=>{if(e.target===e.currentTarget)setCommandOpen(false)}}><div className="trace-react-command-box"><div className="trace-react-command-head"><Search size={17}/><input autoFocus value={commandQuery} onChange={e=>setCommandQuery(e.target.value)} placeholder="Cari modul TRACE…"/><button aria-label="Tutup command palette" onClick={()=>setCommandOpen(false)}><X size={17}/></button></div><div className="trace-react-command-list">{filtered.map(([id,label,Icon])=><button key={id} onClick={()=>choose(id)}><Icon size={17}/><span>{label}</span><kbd>↵</kbd></button>)}{filtered.length===0&&<div className="trace-react-command-empty">Modul tidak ditemukan.</div>}</div></div></div>}
  </div></TraceErrorBoundary></TraceAuthGate>;
}



createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
