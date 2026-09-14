const dns = require('dns').promises;

function isPrivateIp(ip){
  const v=String(ip||'').toLowerCase();
  if(v==='::1'||v==='0.0.0.0') return true;
  if(/^127\./.test(v)||/^10\./.test(v)||/^192\.168\./.test(v)||/^169\.254\./.test(v)||/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true;
  if(/^fc[0-9a-f]{2}:/i.test(v)||/^fd[0-9a-f]{2}:/i.test(v)||/^fe80:/i.test(v)) return true;
  if(/^::ffff:(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(v)) return true;
  return false;
}

async function isPublicHttpUrl(raw){
  try{
    const u=new URL(raw); if(!['http:','https:'].includes(u.protocol)) return false;
    const h=u.hostname.toLowerCase();
    if(h==='localhost'||h.endsWith('.localhost')||h==='0.0.0.0'||h==='::1'||h.endsWith('.local')||h==='metadata.google.internal'||h==='metadata.google.com') return false;
    if(isPrivateIp(h)) return false;
    const answers=await dns.lookup(h,{all:true,verbatim:true});
    return answers.length>0 && !answers.some(a=>isPrivateIp(a.address));
  }catch(e){ return false; }
}

// Server-side public fetch with redirect re-validation. A URL that is public at
// validation time must not be allowed to redirect into loopback/private/link-local
// or cloud-metadata space (DNS rebinding / redirect SSRF).
async function fetchPublicUrl(raw, options={}, timeoutMs=8000, maxRedirects=3){
  let target=String(raw||'');
  for(let hop=0; hop<=maxRedirects; hop++){
    if(!(await isPublicHttpUrl(target))) throw new Error('PUBLIC_URL_VALIDATION_FAILED');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(500,timeoutMs));
    try{
      const response=await fetch(target,{...options,redirect:'manual',signal:controller.signal});
      if(![301,302,303,307,308].includes(response.status)) return response;
      const location=response.headers.get('location');
      if(!location) return response;
      target=new URL(location,target).toString();
    }finally{ clearTimeout(timer); }
  }
  throw new Error('PUBLIC_URL_TOO_MANY_REDIRECTS');
}

module.exports={isPublicHttpUrl,fetchPublicUrl};
