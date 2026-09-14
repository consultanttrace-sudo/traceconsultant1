// test_auth.js — real authentication gate against the actual index.html code.
const { loadApp } = require('./load-app');
const { makeSupaMock } = require('./make-supa-mock');

let pass=0, fail=0;
function assert(cond,msg){ if(cond) pass++; else { fail++; console.error('FAIL:',msg); } }
function tick(ms=25){ return new Promise(r=>setTimeout(r,ms)); }

async function run(){
  // 1) No session: production app must show the auth gate and wait for login.
  {
    const supa=makeSupaMock(new Map(), {read:'ok',write:'ok',connect:'ok',session:null});
    const {win}=loadApp({supabase:supa});
    await tick();
    assert(win.document.getElementById('authOverlay').classList.contains('open'), '1) auth gate must be visible without a session');
    assert(win.document.getElementById('sysLabel').textContent === 'Login diperlukan', '1b) system status must show login required');

    const email=win.document.getElementById('authEmail');
    const passw=win.document.getElementById('authPassword');
    email.value='finance@trace.local'; passw.value='secret';
    win.document.getElementById('authForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
    await tick(80);
    // NOTE: index.html declares `storageMode` and `storageReadyPromise` with
    // `let`/`const` at the top level of its inline script. Top-level
    // `let`/`const` create script-scoped bindings, NOT properties on the
    // global object -- unlike `var`, they are never reachable as
    // `win.storageMode` / `win.storageReadyPromise` from outside the script
    // that declared them. Reading them here always silently returns
    // `undefined`, so `await win.storageReadyPromise` resolves immediately
    // (awaiting undefined is a no-op) and `win.storageMode === 'cloud'` can
    // never pass or fail meaningfully -- it always fails, regardless of the
    // app's real state. Assert against the same DOM-visible signal the app
    // itself exposes to users (updateSysStatus() sets this text per
    // storageMode) instead of reaching for an internal variable that was
    // never actually exported.
    assert(!win.document.getElementById('authOverlay').classList.contains('open'), '2) auth gate must close after successful login');
    assert(win.document.getElementById('authUserEmail').textContent === 'finance@trace.local', '2b) authenticated email must be visible in topbar');
    assert(win.document.getElementById('sysLabel').textContent === 'Tersimpan otomatis', '2c) authenticated session must use cloud storage');

    win.document.getElementById('authLogoutBtn').click();
    await tick(40);
    assert(win.document.getElementById('authOverlay').classList.contains('open'), '3) sign out must lock the app again');
    assert(win.document.getElementById('sysLabel').textContent === 'Login diperlukan', '3b) sign out must invalidate cloud access state');
  }

  console.log(`\\n${pass}/${pass+fail} assertions passed.`);
  process.exit(fail ? 1 : 0);
}
run().catch(e=>{console.error(e);process.exit(1)});
