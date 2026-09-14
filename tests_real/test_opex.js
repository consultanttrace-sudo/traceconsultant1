// test_opex.js (REWRITTEN to call the real engine)
//
// Old version reimplemented computeProfitability() locally and tested that
// copy. This version seeds real storage (Klien/Company/Brand/Outlet/Produk/
// Sales/OPEX) and calls the ACTUAL window.computeOpexProfitability() loaded
// from index.html, activating scope the same way the real UI does.
//
// Run: node test_opex.js

const { loadApp } = require("./load-app");
const { makeSupaMock } = require("./make-supa-mock");
const { seedKlienHierarchy, activateScope } = require("./seed-struktur");

let pass = 0, fail = 0;
function assertEq(label, actual, expected) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`FAIL ${label}: expected ${expected}, got ${actual}`); }
}

async function newApp() {
  const supa = makeSupaMock();
  const { win } = loadApp({ supabase: supa });
  await win.storageReadyPromise;
  return win;
}

async function run() {

  // ---- TEST WAJIB: Client A / Outlet Jakarta ----
  {
    const win = await newApp();
    await seedKlienHierarchy(win, {
      klienId: "clientA", klienName: "Client A",
      companyId: "coA", brandId: "brandA", outletId: "outlet-jakarta-A", outletName: "Jakarta"
    });
    // Produk seharga 1jt/unit, HPP 350rb/unit -> revenue 100jt, cogs 35jt @ qty 100
    await win.saveData("trace-akuntansi-produk", [
      { id: "p1", nama: "Produk A", harga: 1000000, bahan: 350000, tenaga: 0, overhead: 0 }
    ]);
    await win.saveData("trace-outlet-jual", [
      { outletId: "outlet-jakarta-A", produkId: "p1", qty: 100, bulan: 0, tahun: 2026 }
    ]);
    await win.saveData("trace-opex", [
      { scope: "clientA", outletId: "outlet-jakarta-A", category: "Rent", amount: 20000000, bulan: 0, tahun: 2026 },
      { scope: "clientA", outletId: "outlet-jakarta-A", category: "Salary / Labor", amount: 10000000, bulan: 0, tahun: 2026 },
      { scope: "clientA", outletId: "outlet-jakarta-A", category: "Utilities", amount: 5000000, bulan: 0, tahun: 2026 },
      { scope: "clientA", outletId: "outlet-jakarta-A", category: "Marketing", amount: 5000000, bulan: 0, tahun: 2026 }
    ]);
    await activateScope(win, "clientA");
    const r = await win.computeOpexProfitability(0, 2026);
    assertEq("A.totalRevenue", r.totalRevenue, 100000000);
    assertEq("A.totalCogs", r.totalCogs, 35000000);
    assertEq("A.grossProfit", r.totalGrossProfit, 65000000);
    assertEq("A.totalOpex", r.totalOpex, 40000000);
    assertEq("A.operatingProfit", r.totalOperatingProfit, 25000000);
  }

  // ---- ISOLATION: Client A/Bandung vs Client B/"Jakarta" (nama sama, klien beda) ----
  {
    const win = await newApp();
    await win.saveData("trace-clients", [
      { id: "clientA", name: "Client A" }, { id: "clientB", name: "Client B" }
    ]);
    await win.saveData("trace-companies", [
      { id: "coA", klienId: "clientA", nama: "Co A" }, { id: "coB", klienId: "clientB", nama: "Co B" }
    ]);
    await win.saveData("trace-brands", [
      { id: "brandA", companyId: "coA", nama: "Brand A" }, { id: "brandB", companyId: "coB", nama: "Brand B" }
    ]);
    await win.saveData("trace-outlets", [
      { id: "outlet-bandung-A", brandId: "brandA", nama: "Bandung" },
      { id: "outlet-jakarta-B", brandId: "brandB", nama: "Jakarta" } // nama sama dgn test di atas, klien beda
    ]);
    await win.refreshStrukturBisnis();
    await win.saveData("trace-akuntansi-produk", [
      { id: "p1", nama: "Produk A", harga: 1000000, bahan: 350000 }
    ]);
    await win.saveData("trace-outlet-jual", [
      { outletId: "outlet-bandung-A", produkId: "p1", qty: 40, bulan: 0, tahun: 2026 },
      { outletId: "outlet-jakarta-B", produkId: "p1", qty: 999, bulan: 0, tahun: 2026 } // sengaja beda jauh
    ]);
    await win.saveData("trace-opex", [
      { scope: "clientA", outletId: "outlet-bandung-A", category: "Rent", amount: 8000000, bulan: 0, tahun: 2026 },
      { scope: "clientB", outletId: "outlet-jakarta-B", category: "Rent", amount: 500000000, bulan: 0, tahun: 2026 }
    ]);

    await activateScope(win, "clientA");
    const rA = await win.computeOpexProfitability(0, 2026);
    assertEq("isolate.clientA.totalOpex (tidak kemasukan Client B)", rA.totalOpex, 8000000);
    assertEq("isolate.clientA.rows.length (tidak kemasukan outlet Client B)", rA.rows.length, 1);

    await activateScope(win, "clientB");
    const rB = await win.computeOpexProfitability(0, 2026);
    assertEq("isolate.clientB.totalOpex (tidak kemasukan Client A)", rB.totalOpex, 500000000);
  }

  // ---- Bulan berbeda: OPEX Januari tidak boleh ikut ke perhitungan Februari ----
  {
    const win = await newApp();
    await seedKlienHierarchy(win, {
      klienId: "clientA", klienName: "Client A",
      companyId: "coA", brandId: "brandA", outletId: "outlet-jakarta-A", outletName: "Jakarta"
    });
    await win.saveData("trace-akuntansi-produk", [{ id: "p1", nama: "Produk A", harga: 100000, bahan: 30000 }]);
    await win.saveData("trace-outlet-jual", [
      { outletId: "outlet-jakarta-A", produkId: "p1", qty: 10, bulan: 0, tahun: 2026 },
      { outletId: "outlet-jakarta-A", produkId: "p1", qty: 10, bulan: 1, tahun: 2026 }
    ]);
    await win.saveData("trace-opex", [
      { scope: "clientA", outletId: "outlet-jakarta-A", category: "Rent", amount: 20000000, bulan: 0, tahun: 2026 },
      { scope: "clientA", outletId: "outlet-jakarta-A", category: "Rent", amount: 22000000, bulan: 1, tahun: 2026 }
    ]);
    await activateScope(win, "clientA");
    const rJan = await win.computeOpexProfitability(0, 2026);
    const rFeb = await win.computeOpexProfitability(1, 2026);
    assertEq("period.jan.opex", rJan.totalOpex, 20000000);
    assertEq("period.feb.opex", rFeb.totalOpex, 22000000);

    // Edit Februari lewat jalur asli (loadData->modify->saveData), lalu
    // pastikan Januari yang SUDAH dihitung sebelumnya tidak berubah.
    const allOpex = await win.loadData("trace-opex");
    allOpex.find(o => o.bulan === 1).amount = 99000000;
    await win.saveData("trace-opex", allOpex);
    const rJanAfterFebEdit = await win.computeOpexProfitability(0, 2026);
    assertEq("period.jan.opex tetap SETELAH edit Feb (historical data aman)", rJanAfterFebEdit.totalOpex, 20000000);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error("TEST HARNESS CRASHED:", e); process.exit(1); });
