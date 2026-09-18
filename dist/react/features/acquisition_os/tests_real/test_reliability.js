// test_reliability.js (REWRITTEN)
//
// Old version: re-implemented loadData()/saveData()/setupModule()'s delete
// pattern from scratch in this file and tested that copy. A pass proved the
// copy was correct -- it said nothing about whether index.html itself
// behaved this way, and could stay green even if the two silently drifted
// apart.
//
// This version loads the ACTUAL app-inline.js (extracted verbatim from
// index.html) into a jsdom window via load-app.js, and calls the real
// window.loadData / window.saveData / window.setupModule / window.toast /
// window.confirmAction. Every assertion below is checking production code,
// not a stand-in for it.
//
// Run: node test_reliability.js

const { loadApp } = require("./load-app");
const { makeSupaMock } = require("./make-supa-mock");
const { makeTestModuleDom } = require("./make-test-module-dom");

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", msg); }
}

function tick(ms = 15) { return new Promise(r => setTimeout(r, ms)); }

function lastToastText(win) {
  const wrap = win.document.getElementById("toastWrap");
  const last = wrap.lastElementChild;
  return last ? last.textContent : null;
}

async function run() {

  // ---------------------------------------------------------------
  // 1) loadData(): key never written -> normal empty list, not an error
  // ---------------------------------------------------------------
  {
    const supa = makeSupaMock();
    const { win } = loadApp({ supabase: supa });
    await win.storageReadyPromise;
    const result = await win.loadData("never_written_key");
    assert(Array.isArray(result) && result.length === 0,
      "1) loadData() on a key that was never written should return [] (normal, not a failure)");
  }

  // ---------------------------------------------------------------
  // 2) loadData(): real network failure -> THROWS (the 11B fix). Must not
  //    be silently treated the same as "key never written".
  // ---------------------------------------------------------------
  {
    const supa = makeSupaMock(new Map(), { read: "network_fail", write: "ok", connect: "ok" });
    const { win } = loadApp({ supabase: supa });
    await win.storageReadyPromise;
    let threw = false;
    try { await win.loadData("some_key"); }
    catch (e) { threw = /TRACE_LOAD_FAILED/.test(e.message); }
    assert(threw, "2) loadData() must throw (not return []) when the read genuinely fails");
  }

  // ---------------------------------------------------------------
  // 3) setupModule() delete flow, success path: item removed, others
  //    untouched. This is the real generic CRUD engine used by dozens of
  //    sections (OPEX, Marketing/Event, Ops Checklist, dst).
  // ---------------------------------------------------------------
  {
    const kv = new Map();
    const supa = makeSupaMock(kv);
    const { win } = loadApp({ supabase: supa });
    await win.storageReadyPromise;

    const KEY = "rel_test_delete_success";
    await win.saveData(KEY, [
      { id: "item-1", name: "A", createdAt: 1 },
      { id: "item-2", name: "B", createdAt: 2 }
    ]);

    const dom = makeTestModuleDom(win, "relA");
    const handle = win.setupModule({
      prefix: "relA",
      key: KEY,
      template: (it) => `<div class="card"><span>${it.name}</span><button class="del" data-id="${it.id}">Hapus</button></div>`,
      buildItem: () => ({ name: "new" }),
      searchFields: ["name"],
      savedMsg: "Tersimpan."
    });
    await handle.reload();

    const delBtn = dom.list.querySelector('.del[data-id="item-1"]');
    assert(!!delBtn, "3a) delete button for item-1 should be rendered by the real render()");
    delBtn.click(); // synchronously runs up to `await confirmAction(...)`
    win.document.getElementById("confirmOk").click(); // confirm the modal
    await tick();

    const after = await win.loadData(KEY);
    assert(after.length === 1 && after[0].id === "item-2",
      "3b) after confirmed delete, item-1 is gone and item-2 is untouched");
  }

  // ---------------------------------------------------------------
  // 4) setupModule() delete flow, FAILURE path: loadData() fails mid-
  //    delete. Data must NOT be overwritten with an empty/partial array,
  //    and the user must see an explicit error toast (not silence).
  // ---------------------------------------------------------------
  {
    const kv = new Map();
    const supa = makeSupaMock(kv);
    const { win } = loadApp({ supabase: supa });
    await win.storageReadyPromise;

    const KEY = "rel_test_delete_failure";
    await win.saveData(KEY, [{ id: "keep-1", name: "Keep", createdAt: 1 }]);

    const dom = makeTestModuleDom(win, "relB");
    const handle = win.setupModule({
      prefix: "relB",
      key: KEY,
      template: (it) => `<div class="card"><button class="del" data-id="${it.id}">Hapus</button></div>`,
      buildItem: () => ({ name: "x" }),
      searchFields: ["name"],
      savedMsg: "Tersimpan."
    });
    await handle.reload();

    // Now break the read, AFTER boot succeeded (simulates connection
    // dropping mid-session, not at startup).
    supa._mode.read = "network_fail";

    const delBtn = dom.list.querySelector('.del[data-id="keep-1"]');
    delBtn.click();
    win.document.getElementById("confirmOk").click();
    await tick();

    supa._mode.read = "ok"; // restore to verify underlying data afterwards
    const after = await win.loadData(KEY);
    assert(after.length === 1 && after[0].id === "keep-1",
      "4a) data must survive a loadData() failure during delete -- not overwritten with []");
    const toastMsg = lastToastText(win);
    assert(toastMsg === "Gagal memuat data terbaru, penghapusan dibatalkan. Coba lagi.",
      "4b) the exact 11B error toast must be shown to the user, got: " + toastMsg);
  }

  // ---------------------------------------------------------------
  // 5) No "resurrection": once deleted (success path), a later reload
  //    still shows it gone -- not brought back by a stale render.
  // ---------------------------------------------------------------
  {
    const kv = new Map();
    const supa = makeSupaMock(kv);
    const { win } = loadApp({ supabase: supa });
    await win.storageReadyPromise;

    const KEY = "rel_test_no_resurrection";
    await win.saveData(KEY, [{ id: "gone-1", name: "Gone", createdAt: 1 }]);
    const dom = makeTestModuleDom(win, "relC");
    const handle = win.setupModule({
      prefix: "relC", key: KEY,
      template: (it) => `<div class="card"><button class="del" data-id="${it.id}">Hapus</button></div>`,
      buildItem: () => ({ name: "x" }), searchFields: ["name"], savedMsg: "Tersimpan."
    });
    await handle.reload();
    dom.list.querySelector('.del[data-id="gone-1"]').click();
    win.document.getElementById("confirmOk").click();
    await tick();

    await handle.reload(); // simulate a realtime-triggered reload afterwards
    assert(dom.list.querySelector('.del[data-id="gone-1"]') === null,
      "5) deleted item must not reappear after a subsequent reload");
  }

  // ---------------------------------------------------------------
  // 6) saveData(): cloud write fails mid-session -> falls back to
  //    localStorage, still returns true (data not lost), and shows the
  //    explicit "belum tersinkron ke tim" toast (not a silent generic
  //    success message that hides the sync failure).
  // ---------------------------------------------------------------
  {
    const supa = makeSupaMock(new Map(), { read: "ok", write: "network_fail", connect: "ok" });
    const { win } = loadApp({ supabase: supa });
    await win.storageReadyPromise;

    const ok = await win.saveData("rel_test_fallback", [{ id: "x" }]);
    // A local recovery copy is NOT an authoritative cloud commit. The real
    // saveData() contract deliberately returns false so callers cannot
    // advance a workflow as if the team database accepted the write.
    assert(ok === false, "6a) saveData() must report failure when cloud sync fails, even if local recovery succeeds");
    assert(win.localStorage.getItem("trace_os::rel_test_fallback") !== null,
      "6b) data must actually land in localStorage when cloud write fails");
    const toastMsg = lastToastText(win);
    assert(/belum tersinkron ke tim/.test(toastMsg || ""),
      "6c) user must be told sync failed (not a generic success toast), got: " + toastMsg);
  }

  // ---------------------------------------------------------------
  // 7) Corrupt local data (local-only mode) is treated as a real failure,
  //    not silently downgraded to "empty".
  // ---------------------------------------------------------------
  {
    const { win } = loadApp({ supabase: undefined }); // no supabase -> local mode
    await win.storageReadyPromise;
    win.localStorage.setItem("trace_os::rel_test_corrupt", "{not valid json");
    let threw = false;
    try { await win.loadData("rel_test_corrupt"); }
    catch (e) { threw = /TRACE_LOAD_FAILED/.test(e.message); }
    assert(threw, "7) corrupt local JSON must throw, not be treated as an empty dataset");
  }

  // ---------------------------------------------------------------
  // 8) Isolation: two different storage keys never cross-contaminate,
  //    even across a failure scenario on one of them.
  // ---------------------------------------------------------------
  {
    const kv = new Map();
    const supa = makeSupaMock(kv);
    const { win } = loadApp({ supabase: supa });
    await win.storageReadyPromise;
    await win.saveData("rel_test_clientA", [{ id: "a1" }]);
    await win.saveData("rel_test_clientB", [{ id: "b1" }, { id: "b2" }]);
    supa._mode.read = "network_fail";
    try { await win.loadData("rel_test_clientA"); } catch (e) { /* expected */ }
    supa._mode.read = "ok";
    const b = await win.loadData("rel_test_clientB");
    assert(b.length === 2, "8) a failure reading client A's key must not affect client B's data");
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error("TEST HARNESS CRASHED:", e); process.exit(1); });
