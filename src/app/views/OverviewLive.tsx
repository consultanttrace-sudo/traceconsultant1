import { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { asArray, useTraceCollections } from './_shared';

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

export function OverviewLive(){
  const live=useTraceCollections(['trace-companies','trace-brands','trace-outlets','trace-clients']);
  const cards=[['Companies','trace-companies'],['Brands','trace-brands'],['Outlets','trace-outlets'],['Active Clients','trace-clients']];
  return <><div className="trace-card" style={{display:'flex',gap:20,alignItems:'stretch',flexWrap:'wrap'}}>
    <div style={{flex:'1 1 260px',display:'flex',gap:10,alignItems:'center'}}><Activity size={18}/><div><strong>Business Twin · Live Data</strong><div className="trace-muted">Angka berasal dari Supabase; jika sumber gagal, TRACE menampilkan unavailable.</div></div></div>
    <div className="trace-glass" style={{flex:'0 0 260px',height:190,borderRadius:16,overflow:'hidden',position:'relative'}}><TraceOrbitHero/></div>
  </div><div className="trace-kpis" style={{marginTop:14}}>{cards.map(([name,key])=><div className="trace-card" key={key}><div className="trace-muted" style={{fontSize:12}}>{name}</div><div style={{fontSize:28,fontWeight:700,marginTop:8}}>{live.loading?'…':live.error?'—':asArray(live.data[key]).length}</div><div className="trace-muted" style={{fontSize:12,marginTop:5}}>{live.error||'Dibaca dari sumber production dengan session pengguna.'}</div></div>)}</div></>;
}

