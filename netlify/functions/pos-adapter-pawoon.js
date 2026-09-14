// STATUS: SCAFFOLD ONLY — NOT A WORKING INTEGRATION.
// This endpoint defines the request/response contract that the real Pawoon adapter will use once
// TRACE has official API credentials. It intentionally returns 501 until PAWOON_API_BASE_URL and
// PAWOON_API_KEY are set, so it can never silently pretend to sync real data.
//
// To make this real, TRACE (the business, not this code) needs to:
//   1. Register as a Pawoon API partner/merchant integrator and get approved — this is an external
//      business process with Pawoon, not something fixable from a sandbox.
//   2. Obtain PAWOON_API_KEY (and any merchant-specific outlet ID) and set them as Netlify env vars.
//   3. Confirm Pawoon's actual transaction-export endpoint shape (URL, auth header, pagination,
//      field names) from their partner docs — the mapping below is a placeholder shape based on
//      trace_pos_events, not verified against Pawoon's real API, and must be corrected once real
//      docs/credentials are available.
const {cors,requireAuth}=require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode:204,headers:cors(event)};
  const auth=await requireAuth(event); if(!auth.ok)return {statusCode:auth.statusCode,headers:cors(event),body:JSON.stringify({error:auth.error})};
  const apiBase=process.env.PAWOON_API_BASE_URL;
  const apiKey=process.env.PAWOON_API_KEY;
  if(!apiBase||!apiKey){
    return {statusCode:501,headers:{...cors(event),'content-type':'application/json'},body:JSON.stringify({
      error:'not_configured',
      message:'Pawoon adapter belum aktif: PAWOON_API_BASE_URL / PAWOON_API_KEY belum diset, dan approval partner Pawoon belum ada. Ini bukan bug — endpoint ini memang belum bisa dipakai sampai kredensial resmi tersedia.',
    })};
  }
  // Real fetch/mapping to trace_commit_canonical_pos_import goes here once credentials + verified
  // field mapping exist. Left unimplemented deliberately — do not fabricate a mapping without the
  // real API docs in hand.
  return {statusCode:501,headers:{...cors(event),'content-type':'application/json'},body:JSON.stringify({error:'not_implemented',message:'Kredensial ada, tapi mapping field asli dari dokumentasi Pawoon belum diverifikasi. Isi TODO di file ini setelah dokumentasi resmi didapat.'})};
};
