import { buildLeaderCommandCenter } from '../../core/leaderCommandCenter';
import { asArray, useTraceCollections } from './_shared';

export function LeaderCommandCenterView(){
  const live=useTraceCollections(['trace-clients','trace-companies','trace-brands','trace-outlets']);
  const clients=asArray(live.data['trace-clients']);
  const center=buildLeaderCommandCenter([]);
  const label=(key:string)=>live.loading?'Memuat…':live.error?'—':String(asArray(live.data[key]).length);
  return <div style={{display:'grid',gap:16}}><div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>LEADER · COMMAND CENTER</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Satu layar untuk melihat kesehatan seluruh bisnis.</h1><div className="trace-muted">Status hanya berubah berdasarkan data yang tersedia. Tidak ada angka dummy yang dipakai sebagai kondisi bisnis.</div></div><div className="trace-kpis">{[['Total Client',label('trace-clients')],['Companies',label('trace-companies')],['Brands',label('trace-brands')],['Outlets',label('trace-outlets')]].map(([k,v])=><div className="trace-card" key={String(k)}><div className="trace-muted" style={{fontSize:12}}>{k}</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{v}</div></div>)}</div><div className="trace-card"><strong>Production data status</strong><div className="trace-muted" style={{marginTop:7}}>{live.error||(!live.loading&&live.unavailable.length?`Sebagian sumber tidak tersedia: ${live.unavailable.join(', ')}.`:'Data dasar berhasil dibaca dari Supabase dengan session pengguna. Health/priority belum dihitung karena finance, diagnosis, dan action evidence belum dipetakan ke snapshot client.')}</div></div></div>
}
