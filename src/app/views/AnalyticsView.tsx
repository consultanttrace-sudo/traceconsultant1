import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import * as Popover from '@radix-ui/react-popover';
import { calculateKPIs, type KPIInput, type KPIResult } from '../../core/kpi';
import { asArray, useTraceCollections } from './_shared';

export function AnalyticsView(){
  const live=useTraceCollections(['trace-companies','trace-brands','trace-outlets','trace-clients'],['audit']);
  const labels:Record<string,string>={'trace-companies':'Companies','trace-brands':'Brands','trace-outlets':'Outlets','trace-clients':'Clients'};
  const counts=useMemo(()=>Object.keys(labels).map(key=>({key,label:labels[key],value:asArray(live.data[key]).length})),[live.data]);
  const kpis:KPIInput[]=useMemo(()=>counts.map(c=>({id:c.key,name:c.label,current:(live.loading||live.error)?null:c.value,previous:null,unit:'number',evidence:[{source:'Supabase · trace-data',period:'current',value:c.value}],status:(live.loading||live.error)?'unavailable':'available'})),[counts,live.loading,live.error]);
  const results:KPIResult[]=useMemo(()=>calculateKPIs(kpis),[kpis]);
  const auditRows=asArray(live.data['audit']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null);
  const activityByDay=useMemo(()=>{const map=new Map<string,number>();auditRows.forEach(r=>{const d=String(r.created_at??'').slice(0,10);if(d)map.set(d,(map.get(d)||0)+1);});return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-14).map(([date,count])=>({date,count}));},[auditRows]);
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>ANALYTICS · KPI ENGINE</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Angka yang bisa ditelusuri sampai sumbernya.</h1><div className="trace-muted">KPI dihitung dari data live Supabase. Karena snapshot periode sebelumnya belum tersimpan, kolom pembanding ditandai tidak tersedia — bukan nol.</div></div>
    <div className="trace-kpis">{results.map(k=><Popover.Root key={k.id}><Popover.Trigger asChild><div className="trace-card" style={{cursor:'pointer',textAlign:'left'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span className="trace-muted" style={{fontSize:12}}>{k.name}</span><Info size={13} className="trace-muted"/></div><div style={{fontSize:28,fontWeight:800,marginTop:8}}>{k.current==null?'—':k.current.toLocaleString('id-ID')}</div><div className="trace-muted" style={{fontSize:11,marginTop:5}}>{k.conclusion}</div></div></Popover.Trigger><Popover.Portal><Popover.Content className="trace-popover" sideOffset={8}><strong>{k.name}</strong><div className="trace-muted" style={{marginTop:4}}>Formula: {k.formula}</div><div style={{marginTop:6}}>{k.evidence.map((e,i)=><div key={i}>Source: {e.source} · {e.period}</div>)}</div><Popover.Arrow style={{fill:'#fff'}}/></Popover.Content></Popover.Portal></Popover.Root>)}</div>
    <div className="trace-card"><strong>Distribusi entitas saat ini</strong><div style={{width:'100%',height:260,marginTop:14}}>{live.loading?<div className="trace-muted">Memuat…</div>:live.error?<div className="trace-muted">{live.error}</div>:<ResponsiveContainer><BarChart data={counts}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f5"/><XAxis dataKey="label" tick={{fontSize:12}}/><YAxis allowDecimals={false} tick={{fontSize:12}}/><RTooltip contentStyle={{borderRadius:10,border:"1px solid #e6e8f0",boxShadow:"0 20px 40px -24px rgba(16,24,40,.35)",fontSize:12}} labelStyle={{fontWeight:700}}/><Bar dataKey="value" fill="#f9622c" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer>}</div></div>
    <div className="trace-card"><strong>Aktivitas governance · 14 hari terakhir</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Dihitung dari audit log production, dikelompokkan per tanggal.</div><div style={{width:'100%',height:260,marginTop:14}}>{live.loading?<div className="trace-muted">Memuat…</div>:activityByDay.length===0?<div className="trace-muted">Belum ada event audit pada rentang ini.</div>:<ResponsiveContainer><LineChart data={activityByDay}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f5"/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:12}}/><RTooltip contentStyle={{borderRadius:10,border:"1px solid #e6e8f0",boxShadow:"0 20px 40px -24px rgba(16,24,40,.35)",fontSize:12}} labelStyle={{fontWeight:700}}/><Line type="monotone" dataKey="count" stroke="#f9622c" strokeWidth={2.5} dot={{r:3}}/></LineChart></ResponsiveContainer>}</div></div>
  </div>
}

/** Acquisition keeps the proven discovery UI as an embedded module, but it is
 *  mounted inside the authenticated TRACE shell with a persistence bridge.
 *  Lead discovery is global internal acquisition data until a lead is
 *  explicitly converted into a client; converted client data then follows the
 *  normal TRACE client-scope boundary. */
