import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { requireReactSession, asArray, useTraceCollections, money, inputStyle } from './_shared';
import { useClientScope } from '../clientScope';
import { useOutletScope } from '../scopeStore';
import { OutletSelector } from '../components/ScopeSelectors';
import { TracePageHeader, TraceCard, TraceEmptyState } from '../components/TraceUI';

export function MarketingView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useClientScope(); const [outletId]=useOutletScope();
  const [campaigns,setCampaigns]=useState<Array<Record<string,unknown>>>([]);
  const [campaignId,setCampaignId]=useState('');
  const [events,setEvents]=useState<Array<Record<string,unknown>>>([]);
  const [perf,setPerf]=useState<Record<string,unknown>|null>(null);
  const [channelSummary,setChannelSummary]=useState<Array<Record<string,unknown>>>([]);
  const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  const today=new Date().toISOString().slice(0,10);
  const monthAgo=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const [rangeStart,setRangeStart]=useState(monthAgo); const [rangeEnd,setRangeEnd]=useState(today);
  const emptyCampaign={name:'',objective:'',channel:'',start:'',end:'',budget:''};
  const [campaignForm,setCampaignForm]=useState(emptyCampaign);
  const emptyEvent={campaignId:'',eventType:'post',channel:'',date:today,spend:'',reach:'',impressions:'',clicks:'',engagement:'',leads:'',conversions:'',revenue:'',notes:''};
  const [eventForm,setEventForm]=useState(emptyEvent);

  const refresh=async()=>{
    if(!clientId)return;
    try{
      const supabase=await requireReactSession();
      const [campRes,summRes]=await Promise.all([
        supabase.rpc('trace_list_marketing_campaigns',{p_client_id:clientId,p_outlet_id:outletId||null,p_status:null}),
        supabase.rpc('trace_marketing_channel_summary',{p_client_id:clientId,p_start_date:rangeStart,p_end_date:rangeEnd}),
      ]);
      if(campRes.error) throw campRes.error; if(summRes.error) throw summRes.error;
      setCampaigns(asArray(campRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setChannelSummary(asArray(summRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat data marketing.');}
  };
  useEffect(()=>{void refresh();},[clientId,outletId,rangeStart,rangeEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCampaign=async(cid:string)=>{
    setCampaignId(cid);
    try{
      const supabase=await requireReactSession();
      const [evRes,perfRes]=await Promise.all([
        supabase.rpc('trace_list_marketing_events',{p_client_id:clientId,p_outlet_id:outletId||null,p_campaign_id:cid,p_start_date:null,p_end_date:null}),
        supabase.rpc('trace_marketing_campaign_performance',{p_campaign_id:cid}),
      ]);
      if(evRes.error) throw evRes.error; if(perfRes.error) throw perfRes.error;
      setEvents(asArray(evRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setPerf(asArray(perfRes.data)[0] as Record<string,unknown>??null);
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat kampanye.');}
  };

  const createCampaign=async()=>{if(!clientId||!campaignForm.name)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_create_marketing_campaign',{p_client_id:clientId,p_outlet_id:outletId||null,p_name:campaignForm.name,p_objective:campaignForm.objective||null,p_primary_channel:campaignForm.channel||null,p_start_date:campaignForm.start||null,p_end_date:campaignForm.end||null,p_budget_amount:campaignForm.budget===''?0:Number(campaignForm.budget)});if(error)throw error;setMsg('Kampanye dibuat.');setCampaignForm(emptyCampaign);await refresh();if(data)await loadCampaign(String((data as Record<string,unknown>).id));}catch(e){setMsg(e instanceof Error?'Gagal membuat kampanye: '+e.message:'Gagal membuat kampanye: '+'(tidak diketahui).');}finally{setBusy(false);}};

  const logEvent=async()=>{
    if(!clientId||!eventForm.channel)return;setBusy(true);setMsg('');
    try{
      const supabase=await requireReactSession();const n=(v:string)=>v===''?0:Number(v);
      const {error}=await supabase.rpc('trace_log_marketing_event',{p_client_id:clientId,p_outlet_id:outletId||null,p_campaign_id:eventForm.campaignId||campaignId||null,p_content_plan_id:null,p_event_type:eventForm.eventType,p_channel:eventForm.channel,p_event_date:eventForm.date||today,p_spend_amount:n(eventForm.spend),p_reach:n(eventForm.reach),p_impressions:n(eventForm.impressions),p_clicks:n(eventForm.clicks),p_engagement:n(eventForm.engagement),p_leads_generated:n(eventForm.leads),p_conversions:n(eventForm.conversions),p_revenue_attributed:n(eventForm.revenue),p_notes:eventForm.notes||null});
      if(error)throw error;
      setMsg('Event marketing tercatat.');setEventForm(emptyEvent);await refresh();if(campaignId)await loadCampaign(campaignId);
    }catch(e){setMsg(e instanceof Error?'Gagal mencatat event: '+e.message:'Gagal mencatat event: '+'(tidak diketahui).');}finally{setBusy(false);}
  };

  const selectedCampaign=campaigns.find(c=>String(c.id)===campaignId);
  const pct=(v:unknown)=>v==null?'—':`${v}%`;

  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker="MARKETING · CAMPAIGN" title="Kampanye multi-channel dengan ROI, CAC, CTR otomatis." description="Log tiap aktivitas (post, ad spend, promo, giveaway) per channel. ROI dan CAC dihitung dari data yang sama — bukan estimasi manual." />
    <TraceCard style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
      <label>Klien<select value={clientId} onChange={e=>{setClientId(e.target.value);setCampaignId('');setEvents([]);setPerf(null);}} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
      <OutletSelector clientId={clientId}/>
      <label>Dari<input type="date" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} style={inputStyle}/></label>
      <label>Sampai<input type="date" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} style={inputStyle}/></label>
    </TraceCard>
    {msg&&<div className="trace-muted" style={{fontSize:12}}>{msg}</div>}
    {clientId&&<>
      <TraceCard><strong>Ringkasan per Channel ({rangeStart} → {rangeEnd})</strong>
        <div style={{marginTop:10,display:'grid',gap:5}}>{channelSummary.length===0?<TraceEmptyState message="Belum ada data pada rentang ini."/>:channelSummary.map((c,idx)=><div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13}}>
          <span style={{fontWeight:700}}>{String(c.channel)}</span><span>Spend {money(Number(c.total_spend))}</span><span>Reach {String(c.total_reach)}</span><span>Konversi {String(c.total_conversions)}</span><span style={{color:Number(c.roi_pct??0)>=0?'#15803d':'#b91c1c'}}>ROI {pct(c.roi_pct)}</span>
        </div>)}</div>
      </TraceCard>
      <TraceCard><strong>Buat Kampanye</strong>
        <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr 1fr 1fr',gap:8,marginTop:10}}>
          <input placeholder="Nama kampanye" value={campaignForm.name} onChange={e=>setCampaignForm({...campaignForm,name:e.target.value})} style={inputStyle}/>
          <input placeholder="Objective" value={campaignForm.objective} onChange={e=>setCampaignForm({...campaignForm,objective:e.target.value})} style={inputStyle}/>
          <input placeholder="Channel utama" value={campaignForm.channel} onChange={e=>setCampaignForm({...campaignForm,channel:e.target.value})} style={inputStyle}/>
          <input type="date" placeholder="Mulai" value={campaignForm.start} onChange={e=>setCampaignForm({...campaignForm,start:e.target.value})} style={inputStyle}/>
          <input type="date" placeholder="Selesai" value={campaignForm.end} onChange={e=>setCampaignForm({...campaignForm,end:e.target.value})} style={inputStyle}/>
          <input type="number" placeholder="Budget" value={campaignForm.budget} onChange={e=>setCampaignForm({...campaignForm,budget:e.target.value})} style={inputStyle}/>
        </div>
        <button disabled={busy||!campaignForm.name} onClick={createCampaign} style={{marginTop:10,border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>+ Buat Kampanye</button>
      </TraceCard>
      <TraceCard><strong>Daftar Kampanye</strong><div style={{marginTop:10,display:'grid',gap:5}}>{campaigns.length===0?<TraceEmptyState message="Belum ada kampanye."/>:campaigns.map(c=><div key={String(c.id)} onClick={()=>void loadCampaign(String(c.id))} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr auto',gap:8,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13,cursor:'pointer',background:campaignId===String(c.id)?'#fafaf8':'transparent'}}><span>{String(c.name)}</span><span className="trace-muted">{String(c.primary_channel??'—')}</span><span className="trace-muted" style={{textTransform:'uppercase',fontSize:11}}>{String(c.status)}</span><ArrowRight size={14} className="trace-muted"/></div>)}</div></TraceCard>

      {selectedCampaign&&<TraceCard>
        <strong>{String(selectedCampaign.name)}</strong>
        {perf&&<div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginTop:10}}>
          <div><div className="trace-muted" style={{fontSize:11}}>SPEND</div><div style={{fontWeight:700}}>{money(Number(perf.total_spend))}</div></div>
          <div><div className="trace-muted" style={{fontSize:11}}>CTR</div><div style={{fontWeight:700}}>{pct(perf.ctr_pct)}</div></div>
          <div><div className="trace-muted" style={{fontSize:11}}>CONVERSION RATE</div><div style={{fontWeight:700}}>{pct(perf.conversion_rate_pct)}</div></div>
          <div><div className="trace-muted" style={{fontSize:11}}>CAC</div><div style={{fontWeight:700}}>{perf.cac==null?'—':money(Number(perf.cac))}</div></div>
          <div><div className="trace-muted" style={{fontSize:11}}>ROI</div><div style={{fontWeight:700,color:Number(perf.roi_pct??0)>=0?'#15803d':'#b91c1c'}}>{pct(perf.roi_pct)}</div></div>
        </div>}
        <div style={{marginTop:14}}><strong style={{fontSize:13}}>Log Event Marketing</strong>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginTop:8}}>
            <select value={eventForm.eventType} onChange={e=>setEventForm({...eventForm,eventType:e.target.value})} style={inputStyle}>{['post','ad_spend','promo','collab','giveaway','offline_event','referral','other'].map(t=><option key={t} value={t}>{t}</option>)}</select>
            <input placeholder="Channel" value={eventForm.channel} onChange={e=>setEventForm({...eventForm,channel:e.target.value})} style={inputStyle}/>
            <input type="date" value={eventForm.date} onChange={e=>setEventForm({...eventForm,date:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Spend" value={eventForm.spend} onChange={e=>setEventForm({...eventForm,spend:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Reach" value={eventForm.reach} onChange={e=>setEventForm({...eventForm,reach:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Impressions" value={eventForm.impressions} onChange={e=>setEventForm({...eventForm,impressions:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Clicks" value={eventForm.clicks} onChange={e=>setEventForm({...eventForm,clicks:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Engagement" value={eventForm.engagement} onChange={e=>setEventForm({...eventForm,engagement:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Leads" value={eventForm.leads} onChange={e=>setEventForm({...eventForm,leads:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Konversi" value={eventForm.conversions} onChange={e=>setEventForm({...eventForm,conversions:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Revenue teratribusi" value={eventForm.revenue} onChange={e=>setEventForm({...eventForm,revenue:e.target.value})} style={inputStyle}/>
          </div>
          <button disabled={busy||!eventForm.channel} onClick={logEvent} style={{marginTop:10,border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>+ Catat Event</button>
        </div>
        <div style={{marginTop:14,display:'grid',gap:5}}>{events.map(ev=><div key={String(ev.id)} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:12}}><span>{String(ev.event_date)}</span><span>{String(ev.event_type)}</span><span>{String(ev.channel)}</span><span>Spend {money(Number(ev.spend_amount))}</span><span>Konv. {String(ev.conversions)}</span></div>)}</div>
      </TraceCard>}
    </>}
  </div>;
}
