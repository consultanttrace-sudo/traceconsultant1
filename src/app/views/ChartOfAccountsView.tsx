import { useEffect, useState } from 'react';
import { defaultChartOfAccounts, type AccountWithSubType } from '../../core/chartOfAccounts';
import { requireReactSession, loadTraceCollections, asArray, useTraceCollections, inputStyle } from './_shared';

const SUB_TYPE_LABEL: Record<AccountWithSubType['subType'], string> = {
  aset_lancar: 'Aset Lancar',
  aset_tetap: 'Aset Tetap',
  liabilitas_lancar: 'Liabilitas Lancar',
  liabilitas_jangka_panjang: 'Liabilitas Jangka Panjang',
  ekuitas: 'Ekuitas',
  pendapatan_usaha: 'Pendapatan Usaha',
  harga_pokok_penjualan: 'Harga Pokok Penjualan',
  beban_operasional: 'Beban Operasional',
};

export function ChartOfAccountsView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useState('');
  const [existingAccounts,setExistingAccounts]=useState<Array<Record<string,unknown>>>([]);
  const [loading,setLoading]=useState(false);
  const [seeding,setSeeding]=useState(false);
  const [msg,setMsg]=useState('');

  // Sumber kebenaran untuk akun yang SUDAH ada tetap tabel `accounts` yang sama
  // dipakai AccountingView — dicek dulu supaya tombol seed tidak pernah menimpa.
  const refresh=async()=>{
    if(!clientId) { setExistingAccounts([]); return; }
    setLoading(true); setMsg('');
    try{
      const {data}=await loadTraceCollections([],['accounts'],clientId);
      setExistingAccounts(asArray(data.accounts).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
    }catch(e){ setMsg(e instanceof Error?e.message:'Gagal memuat chart of accounts.'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{void refresh()},[clientId]);

  const previewRows:AccountWithSubType[]=clientId?defaultChartOfAccounts(clientId):[];
  const alreadySeeded=existingAccounts.length>0;

  const seedStandardAccounts=async()=>{
    if(!clientId.trim()||alreadySeeded) return;
    setSeeding(true); setMsg('');
    try{
      const supabase=await requireReactSession();
      const rows=defaultChartOfAccounts(clientId.trim()).map(a=>({code:a.code,name:a.name,account_type:a.type}));
      const {data,error}=await supabase.rpc('trace_seed_chart_of_accounts_bulk',{p_client_id:clientId.trim(),p_rows:rows});
      if(error) throw error;
      setMsg(`Akun standar dibuat (${Number(data)??0} baris baru). Cek juga di tab Akuntansi.`);
      await refresh();
    }catch(e){
      const text=e instanceof Error?e.message:'';
      setMsg(text.includes('TRACE_COA_ALREADY_SEEDED')?'Klien ini sudah punya akun — tidak ditimpa. Kelola dari tab Akuntansi.':text.includes('TRACE_COA_ACTOR_FORBIDDEN')?'Akun Anda tidak punya izin membuat chart of accounts.':text?`Gagal: ${text}`:'Gagal membuat chart of accounts.');
    }finally{ setSeeding(false); }
  };

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}>
      <div className="trace-muted" style={{fontSize:12}}>AKUNTANSI · CHART OF ACCOUNTS STANDAR</div>
      <h1 style={{margin:'7px 0 5px',fontSize:30}}>Daftar akun standar F&amp;B, siap pakai.</h1>
      <div className="trace-muted">Diambil langsung dari `defaultChartOfAccounts()` di `src/core/chartOfAccounts.ts` — {previewRows.length||28} akun dengan kode, tipe, dan sub-tipe untuk Neraca. Tombol seed hanya aktif kalau klien terpilih belum punya akun sama sekali di tabel yang sama dipakai tab Akuntansi; kalau sudah ada, seed ditolak supaya tidak menimpa data yang sudah dipakai.</div>
    </div>

    <div className="trace-card">
      <label>Klien<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}>
        <option value="">Pilih klien</option>
        {clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}
      </select></label>
      {loading&&<div className="trace-muted" style={{marginTop:8}}>Memuat…</div>}
      {msg&&<div className="trace-muted" style={{marginTop:8}}>{msg}</div>}
    </div>

    {clientId&&<div className="trace-card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
        <strong>Chart of Accounts standar (preview)</strong>
        <button
          onClick={()=>void seedStandardAccounts()}
          disabled={seeding||loading||alreadySeeded}
          title={alreadySeeded?'Klien ini sudah punya akun — tidak akan ditimpa.':undefined}
          style={{border:0,borderRadius:9,padding:'9px 14px',background:alreadySeeded?'#9ca3af':'#171717',color:'#fff',fontWeight:700,cursor:alreadySeeded?'not-allowed':'pointer'}}
        >{seeding?'Menulis…':alreadySeeded?'Sudah ada akun':'Seed akun standar'}</button>
      </div>
      {alreadySeeded&&<div className="trace-muted" style={{fontSize:12,marginTop:6}}>Klien ini sudah punya {existingAccounts.length} akun tersimpan (lihat tab Akuntansi). Tabel di bawah ini tetap preview dari kode, bukan data yang sudah ditulis.</div>}
      <div style={{overflowX:'auto',marginTop:12}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr>
            <th style={{textAlign:'left',padding:'7px'}}>Kode</th>
            <th style={{textAlign:'left',padding:'7px'}}>Nama</th>
            <th style={{textAlign:'left',padding:'7px'}}>Tipe</th>
            <th style={{textAlign:'left',padding:'7px'}}>Sub-tipe</th>
          </tr></thead>
          <tbody>{previewRows.map(a=><tr key={a.code}>
            <td style={{padding:'7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{a.code}</td>
            <td style={{padding:'7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{a.name}</td>
            <td style={{padding:'7px',borderTop:'1px solid rgba(23,23,23,.06)',textTransform:'capitalize'}}>{a.type}</td>
            <td style={{padding:'7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{SUB_TYPE_LABEL[a.subType]}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}

    {clientId&&existingAccounts.length>0&&<div className="trace-card">
      <strong>Akun tersimpan untuk klien ini (dari tabel yang sama dipakai Akuntansi)</strong>
      <div style={{marginTop:10,display:'grid',gap:5,fontSize:13}}>
        {[...existingAccounts].sort((x,y)=>String(x.code).localeCompare(String(y.code))).map(a=><div key={String(a.id)} style={{display:'grid',gridTemplateColumns:'70px 1fr 100px',gap:10,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}>
          <span className="trace-muted">{String(a.code)}</span><span>{String(a.name)}</span><span className="trace-muted" style={{textTransform:'capitalize'}}>{String(a.account_type)}</span>
        </div>)}
      </div>
    </div>}
  </div>;
}
