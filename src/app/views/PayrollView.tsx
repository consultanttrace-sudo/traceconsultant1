import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { requireReactSession, loadTraceCollections, asArray, useTraceCollections, money, inputStyle } from './_shared';
import { useClientScope } from '../clientScope';
import { useOutletScope, usePeriodScope } from '../scopeStore';
import { OutletSelector } from '../components/ScopeSelectors';
import { TracePageHeader, TraceCard, TraceEmptyState } from '../components/TraceUI';

export function PayrollView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useClientScope(); const [outletId]=useOutletScope();
  const [employees,setEmployees]=useState<Array<Record<string,unknown>>>([]);
  const [runs,setRuns]=useState<Array<Record<string,unknown>>>([]);
  const [runId,setRunId]=useState('');
  const [lines,setLines]=useState<Array<Record<string,unknown>>>([]);
  const [accounts,setAccounts]=useState<Array<Record<string,unknown>>>([]);
  const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  const emptyEmp={code:'',name:'',position:'',type:'tetap',salary:'',hourly:''};
  const [empForm,setEmpForm]=useState(emptyEmp);
  const ps=usePeriodScope('current'); const [openForm,setOpenForm]=useState({period:ps.period,notes:''});
  useEffect(()=>{setOpenForm(f=>f.period===ps.period?f:{...f,period:ps.period});},[ps.period]);
  const emptyLine={employeeId:'',days:'',otHours:'',otMult:'1.5',allowTransport:'',allowMeal:'',allowOther:'',thr:'',bonus:'',bpjsKesEmp:'',bpjsKesCo:'',bpjsJhtEmp:'',bpjsJhtCo:'',bpjsJkkCo:'',bpjsJkmCo:'',bpjsJpEmp:'',bpjsJpCo:'',pph21:'',otherDed:'',dedNotes:''};
  const [lineForm,setLineForm]=useState(emptyLine);
  const [postForm,setPostForm]=useState({labor:'',bpjs:'',tax:'',cash:'',date:new Date().toISOString().slice(0,10)});

  const refresh=async()=>{
    if(!clientId)return;
    try{
      const supabase=await requireReactSession();
      const [empRes,runRes,acctRes]=await Promise.all([
        supabase.rpc('trace_list_employees',{p_client_id:clientId,p_outlet_id:outletId||null,p_status:'active'}),
        supabase.rpc('trace_list_payroll_runs',{p_client_id:clientId,p_outlet_id:outletId||null}),
        loadTraceCollections([],['accounts'],clientId),
      ]);
      if(empRes.error) throw empRes.error; if(runRes.error) throw runRes.error;
      setEmployees(asArray(empRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setRuns(asArray(runRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
      setAccounts(asArray((acctRes as any).data?.accounts).filter((x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'));
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat data payroll.');}
  };
  useEffect(()=>{void refresh();},[clientId,outletId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLines=async(rid:string)=>{setRunId(rid);try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_get_payroll_lines',{p_payroll_run_id:rid});if(error)throw error;setLines(asArray(data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));}catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat baris payroll.');}};
  const empName=(id:string)=>String(employees.find(e=>String(e.id)===id)?.name??id);

  const createEmployee=async()=>{if(!clientId||!empForm.name)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_create_employee',{p_client_id:clientId,p_outlet_id:outletId||null,p_employee_code:empForm.code||null,p_name:empForm.name,p_position:empForm.position||null,p_employment_type:empForm.type,p_base_salary:Number(empForm.salary)||0,p_hourly_rate:Number(empForm.hourly)||0,p_bank_name:null,p_bank_account:null,p_npwp:null,p_bpjs_kesehatan_no:null,p_bpjs_ketenagakerjaan_no:null,p_join_date:null});if(error)throw error;setMsg('Karyawan ditambahkan.');setEmpForm(emptyEmp);await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Gagal menambah karyawan.');}finally{setBusy(false);}};
  const openRun=async()=>{if(!clientId||!openForm.period)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_open_payroll_run',{p_client_id:clientId,p_outlet_id:outletId||null,p_period:openForm.period,p_notes:openForm.notes||null});if(error)throw error;setMsg('Payroll run dibuka.');await refresh();if(data)await loadLines(String((data as Record<string,unknown>).id));}catch(e){setMsg(e instanceof Error?'Gagal membuka payroll run: '+e.message:'Gagal membuka payroll run.');}finally{setBusy(false);}};
  const saveLine=async()=>{if(!runId||!lineForm.employeeId)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const n=(v:string)=>v===''?0:Number(v);const {error}=await supabase.rpc('trace_upsert_payroll_line',{p_payroll_run_id:runId,p_employee_id:lineForm.employeeId,p_days_worked:n(lineForm.days),p_overtime_hours:n(lineForm.otHours),p_overtime_rate_multiplier:n(lineForm.otMult)||1.5,p_allowance_transport:n(lineForm.allowTransport),p_allowance_meal:n(lineForm.allowMeal),p_allowance_other:n(lineForm.allowOther),p_thr_amount:n(lineForm.thr),p_bonus_amount:n(lineForm.bonus),p_bpjs_kesehatan_employee:n(lineForm.bpjsKesEmp),p_bpjs_kesehatan_employer:n(lineForm.bpjsKesCo),p_bpjs_jht_employee:n(lineForm.bpjsJhtEmp),p_bpjs_jht_employer:n(lineForm.bpjsJhtCo),p_bpjs_jkk_employer:n(lineForm.bpjsJkkCo),p_bpjs_jkm_employer:n(lineForm.bpjsJkmCo),p_bpjs_jp_employee:n(lineForm.bpjsJpEmp),p_bpjs_jp_employer:n(lineForm.bpjsJpCo),p_pph21_amount:n(lineForm.pph21),p_other_deductions:n(lineForm.otherDed),p_deduction_notes:lineForm.dedNotes||null});if(error)throw error;setMsg('Baris payroll tersimpan.');setLineForm(emptyLine);await loadLines(runId);}catch(e){setMsg(e instanceof Error?'Gagal menyimpan baris payroll: '+e.message:'Gagal menyimpan baris payroll.');}finally{setBusy(false);}};
  const transition=async(status:string)=>{const r=runs.find(x=>String(x.id)===runId);if(!r)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_transition_payroll_run',{p_payroll_run_id:runId,p_status:status,p_expected_version:Number(r.version),p_reason:null});if(error)throw error;setMsg(`Status diubah ke ${status}.`);await refresh();}catch(e){setMsg(e instanceof Error?'Transisi ditolak: '+e.message:'Transisi ditolak.');}finally{setBusy(false);}};
  const postRun=async()=>{const r=runs.find(x=>String(x.id)===runId);if(!r||!postForm.labor||!postForm.bpjs||!postForm.tax||!postForm.cash)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_post_payroll_run',{p_payroll_run_id:runId,p_expected_version:Number(r.version),p_labor_expense_account_id:postForm.labor,p_bpjs_payable_account_id:postForm.bpjs,p_tax_payable_account_id:postForm.tax,p_cash_bank_account_id:postForm.cash,p_entry_date:postForm.date});if(error)throw error;setMsg('Payroll diposting ke jurnal.');await refresh();}catch(e){setMsg(e instanceof Error?'Gagal posting: '+e.message:'Gagal posting.');}finally{setBusy(false);}};

  const selectedRun=runs.find(r=>String(r.id)===runId);
  const totals=lines.reduce((a:{gross:number;net:number;cost:number},l)=>({gross:a.gross+Number(l.gross_pay||0),net:a.net+Number(l.net_pay||0),cost:a.cost+Number(l.employer_cost_total||0)}),{gross:0,net:0,cost:0});

  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker="LABOR · PAYROLL" title="Payroll dengan BPJS, PPh 21, THR & lembur — dihitung server, bukan Excel manual." description="Gross/net/biaya employer dihitung otomatis saat baris disimpan. Posting hanya bisa dari status Approved, dan langsung membentuk jurnal beban gaji + hutang BPJS/pajak." />
    <TraceCard style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <label>Klien<select value={clientId} onChange={e=>{setClientId(e.target.value);setRunId('');setLines([]);}} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
      <OutletSelector clientId={clientId}/>
    </TraceCard>
    {msg&&<div className="trace-muted" style={{fontSize:12}}>{msg}</div>}
    {clientId&&<>
      <TraceCard><strong>Karyawan</strong>
        <div style={{marginTop:10,display:'grid',gap:5,fontSize:13}}>{employees.length===0?<TraceEmptyState message="Belum ada karyawan."/>:employees.map(e=><div key={String(e.id)} style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr 1fr',gap:8,padding:'5px 0',borderTop:'1px solid rgba(23,23,23,.06)'}}><span>{String(e.name)}</span><span className="trace-muted">{String(e.position??'—')}</span><span className="trace-muted">{String(e.employment_type)}</span><span>{money(Number(e.base_salary||0))}</span></div>)}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr auto',gap:8,marginTop:12}}>
          <input placeholder="Kode (opsional)" value={empForm.code} onChange={e=>setEmpForm({...empForm,code:e.target.value})} style={inputStyle}/>
          <input placeholder="Nama" value={empForm.name} onChange={e=>setEmpForm({...empForm,name:e.target.value})} style={inputStyle}/>
          <input placeholder="Posisi" value={empForm.position} onChange={e=>setEmpForm({...empForm,position:e.target.value})} style={inputStyle}/>
          <select value={empForm.type} onChange={e=>setEmpForm({...empForm,type:e.target.value})} style={inputStyle}>{['tetap','kontrak','harian','lepas','magang'].map(t=><option key={t} value={t}>{t}</option>)}</select>
          <input type="number" placeholder={empForm.type==='harian'?'Rate/jam':'Gaji pokok'} value={empForm.type==='harian'?empForm.hourly:empForm.salary} onChange={e=>setEmpForm(empForm.type==='harian'?{...empForm,hourly:e.target.value}:{...empForm,salary:e.target.value})} style={inputStyle}/>
          <button disabled={busy||!empForm.name} onClick={createEmployee} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>+ Tambah</button>
        </div>
      </TraceCard>
      <TraceCard><strong>Buka Payroll Run</strong><div style={{display:'grid',gridTemplateColumns:'1fr 2fr auto',gap:8,marginTop:10}}><input type="month" value={openForm.period} onChange={e=>setOpenForm({...openForm,period:e.target.value})} style={inputStyle}/><input placeholder="Catatan (opsional)" value={openForm.notes} onChange={e=>setOpenForm({...openForm,notes:e.target.value})} style={inputStyle}/><button disabled={busy} onClick={openRun} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Buka Run</button></div></TraceCard>
      <TraceCard><strong>Riwayat Payroll Run</strong><div style={{marginTop:10,display:'grid',gap:5}}>{runs.length===0?<TraceEmptyState message="Belum ada payroll run."/>:runs.map(r=><div key={String(r.id)} onClick={()=>void loadLines(String(r.id))} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13,cursor:'pointer',background:runId===String(r.id)?'#fafaf8':'transparent'}}><span>{String(r.period)}</span><span className="trace-muted" style={{textTransform:'uppercase',fontSize:11}}>{String(r.status)}</span><ArrowRight size={14} className="trace-muted"/></div>)}</div></TraceCard>
      {selectedRun&&<TraceCard>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Run {String(selectedRun.period)} · {String(selectedRun.status).toUpperCase()}</strong>
          <div style={{display:'flex',gap:8}}>
            {String(selectedRun.status)==='draft'&&<button onClick={()=>void transition('reviewing')} disabled={busy} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'7px 11px',background:'#fff',fontWeight:700}}>Ajukan Review</button>}
            {String(selectedRun.status)==='reviewing'&&<button onClick={()=>void transition('approved')} disabled={busy} style={{border:0,borderRadius:9,padding:'7px 11px',background:'#171717',color:'#fff',fontWeight:700}}>Approve</button>}
            {['draft','reviewing'].includes(String(selectedRun.status))&&<button onClick={()=>void transition('cancelled')} disabled={busy} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'7px 11px',background:'#fff',color:'#b91c1c',fontWeight:700}}>Batalkan</button>}
          </div>
        </div>
        <div className="trace-muted" style={{fontSize:12,marginTop:6}}>Total gross {money(totals.gross)} · Total net {money(totals.net)} · Total biaya employer {money(totals.cost)}</div>
        <div style={{marginTop:10,display:'grid',gap:5}}>{lines.map(l=><div key={String(l.id)} style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr 1fr',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13}}><span>{empName(String(l.employee_id))}</span><span>Gross {money(Number(l.gross_pay))}</span><span>Potongan {money(Number(l.total_deductions))}</span><span style={{fontWeight:700}}>Net {money(Number(l.net_pay))}</span></div>)}</div>
        {['draft','reviewing'].includes(String(selectedRun.status))&&<div style={{marginTop:14,padding:14,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}>
          <strong>Tambah/Update Baris Karyawan</strong>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginTop:10}}>
            <select value={lineForm.employeeId} onChange={e=>setLineForm({...lineForm,employeeId:e.target.value})} style={inputStyle}><option value="">Pilih karyawan</option>{employees.map(e=><option key={String(e.id)} value={String(e.id)}>{String(e.name)}</option>)}</select>
            <input type="number" placeholder="Hari kerja (harian)" value={lineForm.days} onChange={e=>setLineForm({...lineForm,days:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Jam lembur" value={lineForm.otHours} onChange={e=>setLineForm({...lineForm,otHours:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Multiplier lembur" value={lineForm.otMult} onChange={e=>setLineForm({...lineForm,otMult:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Tunj. transport" value={lineForm.allowTransport} onChange={e=>setLineForm({...lineForm,allowTransport:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Tunj. makan" value={lineForm.allowMeal} onChange={e=>setLineForm({...lineForm,allowMeal:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Tunj. lain" value={lineForm.allowOther} onChange={e=>setLineForm({...lineForm,allowOther:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="THR" value={lineForm.thr} onChange={e=>setLineForm({...lineForm,thr:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Bonus" value={lineForm.bonus} onChange={e=>setLineForm({...lineForm,bonus:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="BPJS Kes (karyawan)" value={lineForm.bpjsKesEmp} onChange={e=>setLineForm({...lineForm,bpjsKesEmp:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="BPJS Kes (perusahaan)" value={lineForm.bpjsKesCo} onChange={e=>setLineForm({...lineForm,bpjsKesCo:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="JHT (karyawan)" value={lineForm.bpjsJhtEmp} onChange={e=>setLineForm({...lineForm,bpjsJhtEmp:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="JHT (perusahaan)" value={lineForm.bpjsJhtCo} onChange={e=>setLineForm({...lineForm,bpjsJhtCo:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="JKK (perusahaan)" value={lineForm.bpjsJkkCo} onChange={e=>setLineForm({...lineForm,bpjsJkkCo:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="JKM (perusahaan)" value={lineForm.bpjsJkmCo} onChange={e=>setLineForm({...lineForm,bpjsJkmCo:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="JP (karyawan)" value={lineForm.bpjsJpEmp} onChange={e=>setLineForm({...lineForm,bpjsJpEmp:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="JP (perusahaan)" value={lineForm.bpjsJpCo} onChange={e=>setLineForm({...lineForm,bpjsJpCo:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="PPh 21" value={lineForm.pph21} onChange={e=>setLineForm({...lineForm,pph21:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Potongan lain" value={lineForm.otherDed} onChange={e=>setLineForm({...lineForm,otherDed:e.target.value})} style={inputStyle}/>
            <input placeholder="Catatan potongan" value={lineForm.dedNotes} onChange={e=>setLineForm({...lineForm,dedNotes:e.target.value})} style={inputStyle}/>
          </div>
          <button disabled={busy||!lineForm.employeeId} onClick={saveLine} style={{marginTop:10,border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Simpan Baris</button>
        </div>}
        {String(selectedRun.status)==='approved'&&<div style={{marginTop:14,padding:14,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}>
          <strong>Posting ke Jurnal</strong>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr auto',gap:8,marginTop:10}}>
            <select value={postForm.labor} onChange={e=>setPostForm({...postForm,labor:e.target.value})} style={inputStyle}><option value="">Akun Beban Gaji</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
            <select value={postForm.bpjs} onChange={e=>setPostForm({...postForm,bpjs:e.target.value})} style={inputStyle}><option value="">Akun Hutang BPJS</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
            <select value={postForm.tax} onChange={e=>setPostForm({...postForm,tax:e.target.value})} style={inputStyle}><option value="">Akun Hutang Pajak</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
            <select value={postForm.cash} onChange={e=>setPostForm({...postForm,cash:e.target.value})} style={inputStyle}><option value="">Akun Kas/Bank</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
            <input type="date" value={postForm.date} onChange={e=>setPostForm({...postForm,date:e.target.value})} style={inputStyle}/>
            <button disabled={busy||!postForm.labor||!postForm.bpjs||!postForm.tax||!postForm.cash} onClick={postRun} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Posting</button>
          </div>
        </div>}
      </TraceCard>}
    </>}
  </div>;
}
