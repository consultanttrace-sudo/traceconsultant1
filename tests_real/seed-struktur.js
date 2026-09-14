// seed-struktur.js
//
// Most calculation engines in index.html (computeOpexProfitability, KPI,
// forecast, dst) don't take plain data as arguments -- they read from
// storage via loadData(ALL_KEYS.*) plus module-level state (__strukturCache,
// activeAktScope). To test the REAL functions (not a reimplementation) we
// have to seed that storage and activate scope the same way the real app
// does it, then call the real function with no arguments substituted.

async function seedKlienHierarchy(win, { klienId, klienName, companyId, brandId, outletId, outletName }) {
  await win.saveData("trace-clients", [{ id: klienId, name: klienName, createdAt: 1 }]);
  await win.saveData("trace-companies", [{ id: companyId, klienId, nama: klienName + " HQ", createdAt: 1 }]);
  await win.saveData("trace-brands", [{ id: brandId, companyId, nama: klienName + " Brand", createdAt: 1 }]);
  await win.saveData("trace-outlets", [{ id: outletId, brandId, nama: outletName, createdAt: 1 }]);
  await win.refreshStrukturBisnis();
}

// Switches the Akuntansi module's active scope to `klienId`, the same way
// a user picking it from the #akt_scope dropdown would -- goes through the
// real change handler (index.html, near `activeAktScope`), not a direct
// variable assignment (activeAktScope is a module-private `let`, not
// reachable from outside).
async function activateScope(win, klienId) {
  await win.renderScopeOptions();
  const sel = win.document.getElementById("akt_scope");
  sel.value = klienId;
  sel.dispatchEvent(new win.Event("change"));
  await new Promise(r => setTimeout(r, 15)); // let renderAkuntansiModule() settle
}

module.exports = { seedKlienHierarchy, activateScope };
