import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trace-scope-test-'));
fs.copyFileSync('netlify/functions/_auth.js',path.join(dir,'_auth.js'));
fs.copyFileSync('netlify/functions/trace-data.js',path.join(dir,'trace-data.js'));
let handler;
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_ANON_KEY='anon-test-key-12345678901234567890';
const originalFetch=global.fetch;
function resp(body,status=200){return {ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)};}
try{
  handler=createRequire(import.meta.url)(path.join(dir,'trace-data.js')).handler;
  global.fetch=async(url,opts)=> {
    if(url.includes('/auth/v1/user')) return resp({id:'user-1'});
    if(url.includes('/rpc/trace_read_client_dataset')) return resp({finance:[{id:'a',client_id:'client-A',amount:100}]});
    if(url.includes('/rpc/trace_read_client_kv')) return resp({});
    return resp([]);
  };
  const blocked=await handler({httpMethod:'GET',headers:{authorization:'Bearer session'},queryStringParameters:{resources:'finance'}});
  assert.equal(blocked.statusCode,400);
  const scoped=await handler({httpMethod:'GET',headers:{authorization:'Bearer session'},queryStringParameters:{resources:'finance',client_id:'client-A'}});
  const body=JSON.parse(scoped.body);
  assert.equal(scoped.statusCode,200);
  assert.deepEqual(body.data.finance,[{id:'a',client_id:'client-A',amount:100}]);
  assert.equal(body.scope.clientId,'client-A');
  console.log('trace-data client scope: PASS');
} finally { global.fetch=originalFetch; fs.rmSync(dir,{recursive:true,force:true}); }
