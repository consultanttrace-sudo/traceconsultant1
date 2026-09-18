

export function AcquisitionView(){
  return <div style={{display:'grid',gap:16,height:'calc(100vh - 140px)'}}>
    <div className="trace-card" style={{padding:'14px 20px'}}><div className="trace-muted" style={{fontSize:12}}>ACQUISITION · INTERNAL</div><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Discovery dan pipeline berjalan sebagai modul internal TRACE. Lead tersimpan melalui authenticated persistence bridge; setelah dikonversi menjadi client, data operasional mengikuti client scope TRACE.</div></div>
    <iframe title="TRACE Acquisition OS" src="/acquisition/index.html?embedded=1" style={{flex:1,width:'100%',border:'1px solid rgba(23,23,23,.08)',borderRadius:14,background:'#f4f5f9'}}/>
  </div>
}

