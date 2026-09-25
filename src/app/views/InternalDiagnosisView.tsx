import { Command } from 'lucide-react';
import { diagnoseInternalSystem } from '../../core/internalDiagnosis';
import { TracePageHeader, TraceCard } from '../components/TraceUI';

export function InternalDiagnosisView(){
  const report=diagnoseInternalSystem({});
  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker="TRACE · INTERNAL DIAGNOSIS" title="Kesehatan sistem harus dibuktikan, bukan diasumsikan." description="Finding dikategorikan berdasarkan evidence yang benar-benar tersedia. Status blocked tidak diperlakukan sebagai sehat." />
    <TraceCard><strong>Current conclusion</strong><div style={{marginTop:8}}>{report.conclusion}</div>{report.limitations.map(x=><div className="trace-muted" key={x} style={{marginTop:8}}>{x}</div>)}</TraceCard>
    {report.findings.length===0 ? <TraceCard><strong>Belum ada evidence internal yang diberikan.</strong><div className="trace-muted" style={{marginTop:7}}>Ini bukan PASS. Hubungkan telemetry, diagnostic snapshot, Command Center, dan workflow evidence untuk mendapatkan diagnosis nyata.</div></TraceCard> : report.findings.map(f=><TraceCard key={f.id}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{f.title}</strong><span className="trace-muted">{f.status} · {f.severity}</span></div><div style={{display:'grid',gap:7,marginTop:12,fontSize:13}}><div><b>Apa terjadi:</b> {f.whatHappened}</div><div><b>Evidence:</b> {f.evidence.join(' | ')}</div><div><b>Mengapa:</b> {f.why}</div><div><b>Dampak:</b> {f.impact}</div><div><b>Solusi:</b> {f.solution}</div><div><b>Pencegahan:</b> {f.prevention}</div></div></TraceCard>)}
  </div>
}

