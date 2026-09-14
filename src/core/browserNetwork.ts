/** Browser-side bounded request helper. A caller timeout must cancel the underlying fetch. */
export async function fetchWithTimeout(url:string, options:RequestInit={}, timeoutMs=15000):Promise<Response>{
  if(!Number.isFinite(timeoutMs) || timeoutMs<=0) throw new Error('INVALID_TIMEOUT');
  const controller=new AbortController();
  const parent=options.signal;
  const abort=()=>controller.abort();
  if(parent){if(parent.aborted) controller.abort(); else parent.addEventListener('abort',abort,{once:true});}
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);if(parent)parent.removeEventListener('abort',abort);}
}
