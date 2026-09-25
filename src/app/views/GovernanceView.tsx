import { auditDiff } from '../../core/auditGovernance';
import { asArray, useTraceCollections } from './_shared';
import { TracePageHeader, TraceCard } from '../components/TraceUI';

export function GovernanceView(){
  const live=useTraceCollections([],['audit']);
  const rows=asArray(live.data['audit']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null);
  return <div style={{display:'grid',gap:16}}><TracePageHeader kicker="GOVERNANCE · AUDIT" title="Setiap perubahan punya jejak." description="Audit dibaca read-only dari append-only production log. Audit data belum terhubung jika endpoint production unavailable. Tidak ada event contoh yang dibuat untuk mengisi layar." /><TraceCard><strong>{live.loading?'Memuat audit…':live.error?'Audit tidak tersedia':`${rows.length} event terbaru`}</strong><div className="trace-muted" style={{marginTop:7}}>{live.error||(!live.loading&&live.unavailable.length?'Sebagian sumber audit tidak tersedia.':'Evidence berasal dari Supabase.')}</div>{!live.loading&&!live.error&&rows.slice(0,30).map((row,index)=>{const diff=auditDiff((row.before_data as Record<string,unknown>)??null,(row.after_data as Record<string,unknown>)??null);return <details key={String(row.id??index)} style={{padding:'11px 0',borderTop:'1px solid rgba(23,23,23,.08)'}}><summary style={{cursor:'pointer',fontWeight:700}}>{String(row.action??'event')} · {String(row.entity_type??'entity')} · {String(row.entity_id??'—')} <span className="trace-muted">{String(row.created_at??'')}</span></summary><div style={{fontSize:12,marginTop:8}}><b>Reason:</b> {String(row.reason??'—')}</div>{diff.length===0?<div className="trace-muted" style={{fontSize:12,marginTop:6}}>Tidak ada field yang berubah antara before dan after.</div>:<div style={{marginTop:8,display:'grid',gap:6}}>{diff.map(d=><div key={d.field} style={{fontSize:12,padding:'7px 9px',borderRadius:8,background:'#fafaf8'}}><b>{d.field}</b>: <span style={{color:'#b91c1c'}}>{d.before===undefined?'—':JSON.stringify(d.before)}</span> → <span style={{color:'#15803d'}}>{d.after===undefined?'—':JSON.stringify(d.after)}</span></div>)}</div>}</details>})}</TraceCard></div>
}


