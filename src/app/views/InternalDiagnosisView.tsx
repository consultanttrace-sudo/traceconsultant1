import { Command } from 'lucide-react';
import { diagnoseInternalSystem } from '../../core/internalDiagnosis';

export function InternalDiagnosisView(){
  const report=diagnoseInternalSystem({});
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>TRACE · INTERNAL DIAGNOSIS</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Kesehatan sistem harus dibuktikan, bukan diasumsikan.</h1><div className="trace-muted">Finding dikategorikan berdasarkan evidence yang benar-benar tersedia. Status blocked tidak diperlakukan sebagai sehat.</div></div>
    <div className="trace-card"><strong>Current conclusion</strong><div style={{marginTop:8}}>{report.conclusion}</div>{report.limitations.map(x=><div className="trace-muted" key={x} style={{marginTop:8}}>{x}</div>)}</div>
    {report.findings.length===0 ? <div className="trace-card"><strong>Belum ada evidence internal yang diberikan.</strong><div className="trace-muted" style={{marginTop:7}}>Ini bukan PASS. Hubungkan telemetry, diagnostic snapshot, Command Center, dan workflow evidence untuk mendapatkan diagnosis nyata.</div></div> : report.findings.map(f=><div className="trace-card" key={f.id}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{f.title}</strong><span className="trace-muted">{f.status} · {f.severity}</span></div><div style={{display:'grid',gap:7,marginTop:12,fontSize:13}}><div><b>Apa terjadi:</b> {f.whatHappened}</div><div><b>Evidence:</b> {f.evidence.join(' | ')}</div><div><b>Mengapa:</b> {f.why}</div><div><b>Dampak:</b> {f.impact}</div><div><b>Solusi:</b> {f.solution}</div><div><b>Pencegahan:</b> {f.prevention}</div></div></div>)}
  </div>
}

