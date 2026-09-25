import { useState } from 'react';
import { calculatePpn, extractPpnFromGrossPrice, calculatePphFinalUmkm, summarizeMonthlyTax, type PpnResult, type PphFinalUmkmResult, type TaxSummary } from '../../core/taxCalculator';
import { money, inputStyle } from './_shared';
import { TracePageHeader, TraceCard } from '../components/TraceUI';

const numOrNull=(s:string):number|null=>{ const n=Number(s); return s.trim()!==''&&Number.isFinite(n)?n:null; };
const btnStyle:React.CSSProperties={border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'};
const rowStyle:React.CSSProperties={display:'flex',justifyContent:'space-between',padding:'5px 0',borderTop:'1px solid rgba(23,23,23,.06)'};

export function TaxView(){
  // ── PPN ──────────────────────────────────────────────────────────────
  const [ppnMode,setPpnMode]=useState<'dpp'|'gross'>('dpp');
  const [ppnAmount,setPpnAmount]=useState('');
  const [ppnTarif,setPpnTarif]=useState('11');
  const [ppnResult,setPpnResult]=useState<PpnResult|null>(null);
  const [ppnMsg,setPpnMsg]=useState('');
  const hitungPpn=()=>{
    const amount=numOrNull(ppnAmount), tarif=numOrNull(ppnTarif);
    if(amount===null||amount<0){ setPpnMsg('Isi angka yang valid dulu.'); setPpnResult(null); return; }
    setPpnMsg('');
    setPpnResult(ppnMode==='dpp'?calculatePpn(amount,tarif??undefined):extractPpnFromGrossPrice(amount,tarif??undefined));
  };

  // ── PPh Final UMKM ───────────────────────────────────────────────────
  const [omset,setOmset]=useState('');
  const [pphTarif,setPphTarif]=useState('0.5');
  const [pphResult,setPphResult]=useState<PphFinalUmkmResult|null>(null);
  const [pphMsg,setPphMsg]=useState('');
  const hitungPph=()=>{
    const omsetVal=numOrNull(omset), tarif=numOrNull(pphTarif);
    if(omsetVal===null||omsetVal<0){ setPphMsg('Isi omset yang valid dulu.'); setPphResult(null); return; }
    setPphMsg('');
    setPphResult(calculatePphFinalUmkm(omsetVal,tarif??undefined));
  };

  // ── Ringkasan Bulanan ────────────────────────────────────────────────
  const [period,setPeriod]=useState('');
  const [ppnKeluaran,setPpnKeluaran]=useState('');
  const [ppnMasukan,setPpnMasukan]=useState('');
  const [pphFinalInput,setPphFinalInput]=useState('');
  const [summary,setSummary]=useState<TaxSummary|null>(null);
  const [summaryMsg,setSummaryMsg]=useState('');
  const hitungRingkasan=()=>{
    const keluaran=numOrNull(ppnKeluaran), masukan=numOrNull(ppnMasukan), pphFinal=numOrNull(pphFinalInput);
    if(!period.trim()||keluaran===null||masukan===null||pphFinal===null){ setSummaryMsg('Isi periode dan ketiga angka dulu — semua wajib untuk ringkasan ini.'); setSummary(null); return; }
    setSummaryMsg('');
    setSummary(summarizeMonthlyTax(period.trim(),keluaran,masukan,pphFinal));
  };
  const rawSelisih=summary?summary.ppnKeluaran-summary.ppnMasukan:null;

  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker="AKUNTANSI · KALKULATOR PAJAK (INPUT MANUAL)" title="Estimasi PPN & PPh Final UMKM" description={<>
        Kalkulator ini murni input manual — bukan otomatis dari data transaksi TRACE. Hanya untuk estimasi internal
        memakai tarif publik umum saat ditulis (PPN 11%, PPh Final UMKM 0,5%). <strong>Bukan pengganti akuntan/konsultan
        pajak resmi, bukan alat lapor SPT ke DJP</strong>, dan tidak memperhitungkan status PKP, jenis usaha, atau skema
        pajak khusus klien. Tarif bisa berubah — selalu verifikasi ke peraturan terbaru dan akuntan klien sebelum angka
        ini dipakai untuk keputusan atau pelaporan resmi.
      </>} />

    <TraceCard>
      <strong>1 · PPN</strong>
      <div className="trace-muted" style={{fontSize:12,marginTop:4}}>Pilih apakah angka yang Anda punya sudah termasuk PPN atau belum.</div>
      <div style={{display:'flex',gap:16,marginTop:10,fontSize:13}}>
        <label><input type="radio" checked={ppnMode==='dpp'} onChange={()=>setPpnMode('dpp')}/> DPP (harga belum termasuk PPN)</label>
        <label><input type="radio" checked={ppnMode==='gross'} onChange={()=>setPpnMode('gross')}/> Harga sudah termasuk PPN</label>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 140px auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>{ppnMode==='dpp'?'DPP (Rp)':'Harga termasuk PPN (Rp)'}<input type="number" value={ppnAmount} onChange={e=>setPpnAmount(e.target.value)} style={inputStyle} placeholder="1000000"/></label>
        <label style={{fontSize:12}}>Tarif (%)<input type="number" value={ppnTarif} onChange={e=>setPpnTarif(e.target.value)} style={inputStyle}/></label>
        <button onClick={hitungPpn} style={btnStyle}>Hitung PPN</button>
      </div>
      {ppnMsg&&<div className="trace-muted" style={{marginTop:8,fontSize:12}}>{ppnMsg}</div>}
      {ppnResult&&<div style={{marginTop:12,fontSize:13}}>
        <div style={rowStyle}><span>DPP</span><span>{money(ppnResult.dpp)}</span></div>
        <div style={rowStyle}><span>Tarif</span><span>{ppnResult.tarifPersen}%</span></div>
        <div style={{...rowStyle,fontWeight:700}}><span>PPN</span><span>{money(ppnResult.ppn)}</span></div>
        <div style={rowStyle}><span>Total termasuk PPN</span><span>{money(ppnResult.totalTermasukPpn)}</span></div>
      </div>}
    </TraceCard>

    <TraceCard>
      <strong>2 · PPh Final UMKM</strong>
      <div className="trace-muted" style={{fontSize:12,marginTop:4}}>0,5% dari omset bulanan (bukan dari laba). Kelayakan skema ini harus dicek ke akuntan klien — kalkulator ini tidak memvalidasinya.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 140px auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>Omset Bulanan (Rp)<input type="number" value={omset} onChange={e=>setOmset(e.target.value)} style={inputStyle} placeholder="50000000"/></label>
        <label style={{fontSize:12}}>Tarif (%)<input type="number" step="0.1" value={pphTarif} onChange={e=>setPphTarif(e.target.value)} style={inputStyle}/></label>
        <button onClick={hitungPph} style={btnStyle}>Hitung PPh Final</button>
      </div>
      {pphMsg&&<div className="trace-muted" style={{marginTop:8,fontSize:12}}>{pphMsg}</div>}
      {pphResult&&<div style={{marginTop:12,fontSize:13}}>
        <div style={rowStyle}><span>Omset Bulanan</span><span>{money(pphResult.omsetBulanan)}</span></div>
        <div style={rowStyle}><span>Tarif</span><span>{pphResult.tarifPersen}%</span></div>
        <div style={{...rowStyle,fontWeight:700}}><span>PPh Final Terutang</span><span>{money(pphResult.pphTerutang)}</span></div>
      </div>}
    </TraceCard>

    <TraceCard>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <strong>3 · Ringkasan Pajak Bulanan</strong>
        {(ppnResult||pphResult)&&<button onClick={()=>{ if(ppnResult) setPpnKeluaran(String(ppnResult.ppn)); if(pphResult) setPphFinalInput(String(pphResult.pphTerutang)); }} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:8,padding:'6px 10px',background:'#fff',fontWeight:700,fontSize:12,cursor:'pointer'}}>Isi dari hasil di atas</button>}
      </div>
      <div className="trace-muted" style={{fontSize:12,marginTop:4}}>PPN Kurang Bayar = PPN Keluaran − PPN Masukan. Semua field di bawah tetap input manual — isi sendiri atau pakai tombol "Isi dari hasil di atas" untuk PPN Keluaran & PPh Final.</div>
      <div style={{display:'grid',gridTemplateColumns:'110px 1fr 1fr 1fr auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>Periode<input value={period} onChange={e=>setPeriod(e.target.value)} placeholder="2026-09" style={inputStyle}/></label>
        <label style={{fontSize:12}}>PPN Keluaran (Rp)<input type="number" value={ppnKeluaran} onChange={e=>setPpnKeluaran(e.target.value)} style={inputStyle}/></label>
        <label style={{fontSize:12}}>PPN Masukan (Rp)<input type="number" value={ppnMasukan} onChange={e=>setPpnMasukan(e.target.value)} style={inputStyle}/></label>
        <label style={{fontSize:12}}>PPh Final (Rp)<input type="number" value={pphFinalInput} onChange={e=>setPphFinalInput(e.target.value)} style={inputStyle}/></label>
        <button onClick={hitungRingkasan} style={btnStyle}>Hitung Ringkasan</button>
      </div>
      {summaryMsg&&<div className="trace-muted" style={{marginTop:8,fontSize:12}}>{summaryMsg}</div>}
      {summary&&<div style={{marginTop:12,fontSize:13}}>
        <div style={rowStyle}><span>Periode</span><span>{summary.period}</span></div>
        <div style={rowStyle}><span>PPN Keluaran</span><span>{money(summary.ppnKeluaran)}</span></div>
        <div style={rowStyle}><span>PPN Masukan</span><span>{money(summary.ppnMasukan)}</span></div>
        <div style={rowStyle}><span>PPN Kurang Bayar</span><span>{money(summary.ppnKurangBayar)}</span></div>
        <div style={rowStyle}><span>PPh Final</span><span>{money(summary.pphFinal)}</span></div>
        <div style={{...rowStyle,fontWeight:700}}><span>Total Kewajiban Pajak</span><span>{money(summary.totalKewajibanPajak)}</span></div>
        {rawSelisih!==null&&rawSelisih<0&&<div style={{marginTop:8,fontSize:12,color:'#b91c1c'}}>
          PPN Masukan lebih besar dari PPN Keluaran (selisih {money(rawSelisih)}) — ini kelebihan bayar (lebih bayar), bukan Rp0. `summarizeMonthlyTax` menampilkan PPN Kurang Bayar sebagai Rp0 karena tidak bisa negatif, tapi kelebihan bayar ini tetap perlu dikonfirmasi ke akuntan klien, jangan diabaikan.
        </div>}
      </div>}
    </TraceCard>
  </div>;
}
