import { useEffect, useRef } from 'react';
import { setScope } from '../scopeStore';
import { scopePatchForLink } from '../../core/scope';
import { OverviewDashboard, type OverviewModel } from '../components/OverviewDashboard';
import { portfolioToCsv } from '../../core/portfolioHealth';
import { usePortfolio } from '../portfolio';

export function TraceOrbitHero(){
  const ref=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const container=ref.current;
    if(!container) return;
    let disposed=false;
    let cleanup:(()=>void)|null=null;
    import('three').then((THREE)=>{
      if(disposed||!container) return;
      try{
        const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const width=container.clientWidth||320, height=container.clientHeight||200;
        const scene=new THREE.Scene();
        const camera=new THREE.PerspectiveCamera(45,width/height,0.1,100);
        camera.position.set(0,0,5.4);
        const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
        renderer.setSize(width,height);
        container.appendChild(renderer.domElement);

        const group=new THREE.Group();
        const icoGeo=new THREE.IcosahedronGeometry(1.5,1);
        const edges=new THREE.EdgesGeometry(icoGeo);
        const lineMat=new THREE.LineBasicMaterial({color:0xf9622c,transparent:true,opacity:.78});
        const wire=new THREE.LineSegments(edges,lineMat);
        group.add(wire);

        const count=140;
        const positions=new Float32Array(count*3);
        for(let i=0;i<count;i++){
          const r=2.15+(i%17)/16*0.55;
          const theta=(i*2.399963229728653)% (Math.PI*2);
          const phi=Math.acos(2*((i*0.618033988749895)%1)-1);
          positions[i*3]=r*Math.sin(phi)*Math.cos(theta);
          positions[i*3+1]=r*Math.sin(phi)*Math.sin(theta);
          positions[i*3+2]=r*Math.cos(phi);
        }
        const particleGeo=new THREE.BufferGeometry();
        particleGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
        const particleMat=new THREE.PointsMaterial({color:0xffb35a,size:0.045,transparent:true,opacity:.85});
        const points=new THREE.Points(particleGeo,particleMat);
        group.add(points);
        scene.add(group);

        const resize=()=>{
          const w=container.clientWidth||width, h=container.clientHeight||height;
          renderer.setSize(w,h);
          camera.aspect=w/h;
          camera.updateProjectionMatrix();
        };
        const resizeObserver=new ResizeObserver(resize);
        resizeObserver.observe(container);

        let frameId=0;
        const animate=()=>{
          group.rotation.y+=0.0026;
          group.rotation.x+=0.001;
          renderer.render(scene,camera);
          if(!reduceMotion) frameId=requestAnimationFrame(animate);
        };
        animate();

        cleanup=()=>{
          cancelAnimationFrame(frameId);
          resizeObserver.disconnect();
          icoGeo.dispose();edges.dispose();lineMat.dispose();
          particleGeo.dispose();particleMat.dispose();
          renderer.dispose();
          if(container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
        };
        if(disposed) cleanup();
      }catch{
        // WebGL unavailable/blocked — leave the glass panel empty rather than crash the page.
      }
    });
    return ()=>{disposed=true;cleanup?.();};
  },[]);
  return <div ref={ref} style={{width:'100%',height:'100%',minHeight:190}} aria-hidden="true"/>;
}

/**
 * Overview = portfolio health across all clients (or one client when filtered).
 * Data comes from PortfolioProvider (per-client finance + persisted alerts); the API never mixes
 * clients in one response, so each client is loaded in its own scoped call.
 */
export function OverviewLive({ onNavigate }: { onNavigate: (id: string) => void }){
  const p=usePortfolio();
  if(!p) return <div className="trace-recovery-banner">Konteks portofolio belum tersedia.</div>;
  const phase=p.phase==='idle'?'loading':p.phase;
  const model:OverviewModel={
    phase:phase==='ready'||phase==='error'?phase:'loading',
    error:p.error, progress:p.progress,
    scopeRows:p.scopeRows, allRows:p.allRows, summary:p.summary, allSummary:p.allSummary,
    trend:p.trend, reading:p.reading, insight:p.insight, priority:p.priority, queue:p.queue, tasksUnavailable:p.tasksUnavailable, jalur:p.jalur,
    selectedClientId:p.filters.clientId, selectedClientName:p.selectedClientName,
    periodLabel:p.periodLabel, range:p.filters.range
  };
  const share=async()=>{
    try{await navigator.clipboard.writeText(location.href);p.notify('Link tersalin — membuka link ini menampilkan filter yang sama.');}
    catch{p.notify('Browser menolak akses clipboard. Salin link dari address bar.');}
  };
  const exportCsv=()=>{
    const rows=p.scopeRows;
    if(!rows.length){p.notify('Belum ada data untuk diekspor.');return;}
    const blob=new Blob(['\uFEFF'+portfolioToCsv(rows)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`trace-kesehatan-klien-${p.filters.period||'terbaru'}.csv`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    p.notify(`${rows.length} klien diekspor ke CSV.`);
  };
  const createTask=async(clientId:string,finding:Parameters<typeof p.createWorkstreamTask>[1])=>{
    const result=await p.createWorkstreamTask(clientId,finding);
    p.notify(result.message);
    return result.ok;
  };
  return <OverviewDashboard model={model} onSelectClient={id=>p.setFilters({clientId:id})} onRange={range=>p.setFilters({range})} onOpenModule={onNavigate} onOpenTask={id=>{p.setFilters({clientId:id});onNavigate('business');}} onOpenFor={(moduleId,clientId,period)=>{setScope(scopePatchForLink({moduleId,clientId:clientId||undefined,period}));onNavigate(moduleId);}} onCreateTask={createTask} onShare={share} onExport={exportCsv} onReload={p.reload}/>;
}
