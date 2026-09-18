import { useEffect, useState } from 'react';
import { type IntakeResult } from '../../core/dataIntake';
import { deleteRecoverySnapshot, listRecoverySnapshots, type RecoverySnapshot } from '../../core/durableRecovery';

export function DataRecovery(){
  type RecoveryData={fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult};
  const [rows,setRows]=useState<RecoverySnapshot<RecoveryData>[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const refresh=async()=>{setLoading(true);setError('');try{setRows(await listRecoverySnapshots<RecoveryData>('data-intake'));}catch(e){setError(e instanceof Error?e.message:'Recovery tidak tersedia.');}finally{setLoading(false)}};
  useEffect(()=>{void refresh();},[]);
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card trace-hero"><div className="trace-section-kicker">TRACE · DATA RECOVERY</div><h1>Data tidak boleh hilang hanya karena browser crash.</h1><p className="trace-muted">Draft Data Intake disimpan sebagai checkpoint lokal dan tetap diarahkan ke ledger Supabase sebagai sumber utama. Recovery tidak mengubah data production secara otomatis.</p><div className="trace-hero-pills"><span>LOCAL CHECKPOINT</span><span>SUPABASE PRIMARY</span><span>NO SILENT OVERWRITE</span></div></div>
    <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><div><strong>Recovered work</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Checkpoint terbaru ditampilkan lebih dulu.</div></div><button className="trace-button" onClick={refresh}>Refresh</button></div>{loading?<div className="trace-muted" style={{marginTop:12}}>Memuat checkpoint…</div>:error?<div className="trace-alert">{error}</div>:rows.length===0?<div className="trace-empty" style={{marginTop:12}}><strong>Tidak ada checkpoint lokal.</strong><div className="trace-muted">Ini bukan berarti data production kosong; halaman ini hanya menampilkan recovery lokal.</div></div>:<div style={{display:'grid',gap:10,marginTop:12}}>{rows.map(row=><details key={row.id} className="trace-recovery-item"><summary><span><strong>{row.sourceName||row.data.fileName||'Untitled import'}</strong><small>{row.status.toUpperCase()} · {new Date(row.updatedAt).toLocaleString('id-ID')}</small></span><span>{row.sourceHash?.slice(0,12)}…</span></summary><div className="trace-muted" style={{fontSize:12,marginTop:8}}>Coverage {row.data.result.coveragePct}% · {row.data.result.missingLabels.length} field belum tersedia.</div><button className="trace-button" style={{marginTop:10}} onClick={async()=>{await deleteRecoverySnapshot(row.id);await refresh();}}>Hapus checkpoint lokal</button></details>)}</div>}</div>
    <div className="trace-card"><strong>Recovery contract</strong><div className="trace-recovery-grid"><div><b>1 · Checkpoint</b><span>Setiap perubahan penting disimpan sebelum user meninggalkan flow.</span></div><div><b>2 · Provenance</b><span>SHA-256 source tetap dipertahankan.</span></div><div><b>3 · Production</b><span>Commit tetap melalui status workflow server.</span></div><div><b>4 · No guessing</b><span>Recovery tidak pernah membuat angka yang tidak ada.</span></div></div></div>
  </div>;
}

