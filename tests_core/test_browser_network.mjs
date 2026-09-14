import assert from 'node:assert/strict';
import {fetchWithTimeout} from '../dist/core/browserNetwork.js';
const original=globalThis.fetch;
let aborted=false;
globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>{aborted=true;reject(Object.assign(new Error('aborted'),{name:'AbortError'}));});});
await assert.rejects(()=>fetchWithTimeout('/slow',{},20),/aborted/);
assert.equal(aborted,true);
globalThis.fetch=original;
console.log('browser fetch timeout cancels underlying request: PASS');
