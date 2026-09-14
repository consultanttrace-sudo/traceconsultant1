import assert from 'node:assert/strict';
import { buildTrialBalance } from '../dist/core/accounting.js';
import { defaultChartOfAccounts, normalBalanceOf } from '../dist/core/chartOfAccounts.js';
import { buildBalanceSheet } from '../dist/core/balanceSheet.js';
import { buildCashFlowStatement } from '../dist/core/cashFlowStatement.js';
import { buildArAging } from '../dist/core/accountsReceivable.js';
import { buildApAging } from '../dist/core/accountsPayable.js';
import { buildDepreciationSchedule, totalMonthlyDepreciation } from '../dist/core/fixedAssets.js';
import { calculatePpn, extractPpnFromGrossPrice, calculatePphFinalUmkm, summarizeMonthlyTax } from '../dist/core/taxCalculator.js';
import { isPeriodLocked, assertPeriodNotLocked, buildClosingEntry } from '../dist/core/periodClose.js';
import { inferAccountSubType, withInferredSubTypes } from '../dist/core/accountSubTypeInference.js';

// ── 1) CHART OF ACCOUNTS + NERACA (kasus nyata sebulan operasi cafe) ────────
const accounts = defaultChartOfAccounts('c1');
const byCode = Object.fromEntries(accounts.map(a => [a.code, a]));
assert.equal(accounts.length, 28); // chartOfAccounts.ts berisi 28 baris akun (bukan 25 seperti disebut di ringkasan)
assert.equal(normalBalanceOf('liability'), 'credit');
assert.equal(normalBalanceOf('asset'), 'debit');

const kas = byCode['1100'].id, modal = byCode['3100'].id, peralatan = byCode['1500'].id;
const penjualan = byCode['4100'].id, hpp = byCode['5100'].id, utangUsaha = byCode['2100'].id, gaji = byCode['6100'].id;

const entries = [
  { id: 'e1', clientId: 'c1', date: '2026-09-01', memo: 'setoran modal awal', source: 'manual', lines: [{ accountId: kas, debit: 10_000_000, credit: 0 }, { accountId: modal, debit: 0, credit: 10_000_000 }] },
  { id: 'e2', clientId: 'c1', date: '2026-09-02', memo: 'beli peralatan dapur tunai', source: 'manual', lines: [{ accountId: peralatan, debit: 3_000_000, credit: 0 }, { accountId: kas, debit: 0, credit: 3_000_000 }] },
  { id: 'e3', clientId: 'c1', date: '2026-09-30', memo: 'penjualan makanan tunai sebulan', source: 'system', lines: [{ accountId: kas, debit: 2_000_000, credit: 0 }, { accountId: penjualan, debit: 0, credit: 2_000_000 }] },
  { id: 'e4', clientId: 'c1', date: '2026-09-15', memo: 'beli bahan baku dari supplier, belum dibayar', source: 'system', lines: [{ accountId: hpp, debit: 800_000, credit: 0 }, { accountId: utangUsaha, debit: 0, credit: 800_000 }] },
  { id: 'e5', clientId: 'c1', date: '2026-09-30', memo: 'bayar gaji tunai', source: 'manual', lines: [{ accountId: gaji, debit: 500_000, credit: 0 }, { accountId: kas, debit: 0, credit: 500_000 }] },
];

const tb = buildTrialBalance(accounts, entries);
assert.equal(tb.balanced, true);
assert.equal(tb.missingAccountIds.length, 0);

const labaBerjalan = 2_000_000 - 800_000 - 500_000; // Penjualan - HPP - Beban Gaji
const bs = buildBalanceSheet(accounts, tb, '2026-09', labaBerjalan);

// Ini regression guard untuk bug yang disebutkan sudah diperbaiki: sebelum bug
// itu ditambal, Liabilitas & Ekuitas tersimpan dengan tanda terbalik (karena
// accounting.ts menyimpan saldo mentah sebagai debit-credit untuk SEMUA akun),
// sehingga Neraca tidak akan pernah balance walau jurnalnya sendiri seimbang.
assert.equal(bs.totalAset, 11_500_000, 'Total Aset harus 11.500.000 (Kas 8,5jt + Peralatan 3jt)');
assert.equal(bs.totalLiabilitas, 800_000, 'Utang Usaha harus tampil POSITIF 800rb, bukan -800rb');
assert.equal(bs.totalEkuitas, 10_700_000, 'Modal 10jt harus tampil POSITIF, plus laba berjalan 700rb');
assert.equal(bs.totalLiabilitasDanEkuitas, 11_500_000);
assert.equal(bs.selisih, 0);
assert.equal(bs.balanced, true, 'Aset = Liabilitas + Ekuitas harus benar-benar sama');

// ── 2) ARUS KAS (metode tidak langsung) ─────────────────────────────────────
const cf = buildCashFlowStatement({
  period: '2026-09',
  labaBersih: 700_000,
  bebanPenyusutan: 0,
  perubahanPiutangUsaha: 0,
  perubahanPersediaan: 0,
  perubahanUtangUsaha: 800_000,
  perubahanAsetTetapKotor: 3_000_000,
  perubahanUtangBank: 0,
  perubahanModal: 10_000_000,
  prive: 0,
  kasAwalPeriode: 0,
});
assert.equal(cf.missingInputs.length, 0);
assert.equal(cf.operasional.total, 1_500_000); // 700rb laba + 800rb kenaikan utang usaha
assert.equal(cf.investasi.total, -3_000_000);
assert.equal(cf.pendanaan.total, 10_000_000);
assert.equal(cf.kenaikanKasBersih, 8_500_000);
assert.equal(cf.kasAkhirPeriode, 8_500_000, 'kas akhir arus kas harus cocok dengan saldo Kas di Neraca');

// ── 3) PIUTANG & UTANG (aging) ──────────────────────────────────────────────
const ar = buildArAging(
  [{ id: 'inv1', clientId: 'c1', customerName: 'PT Katering Sejahtera', invoiceDate: '2026-07-01', dueDate: '2026-07-15', amount: 5_000_000 }],
  [{ invoiceId: 'inv1', amount: 2_000_000, paidDate: '2026-08-01' }],
  '2026-09-30',
);
assert.equal(ar.invoices[0].status, 'sebagian');
assert.equal(ar.invoices[0].outstanding, 3_000_000);
assert.equal(ar.invoices[0].agingBucket, '61-90'); // jatuh tempo 15 Jul, per 30 Sep = 77 hari telat
assert.equal(ar.totalOutstanding, 3_000_000);

const ap = buildApAging(
  [{ id: 'bill1', clientId: 'c1', vendorName: 'Supplier Sayur', billDate: '2026-09-15', dueDate: '2026-09-25', amount: 800_000 }],
  [],
  '2026-09-30',
);
assert.equal(ap.bills[0].status, 'belum_dibayar');
assert.equal(ap.bills[0].agingBucket, '0-30'); // telat 5 hari dari jatuh tempo
assert.equal(ap.totalOutstanding, 800_000);

// ── 4) ASET TETAP & PENYUSUTAN ──────────────────────────────────────────────
const mesin = { id: 'ft1', clientId: 'c1', name: 'Peralatan Dapur & Kasir', acquisitionDate: '2026-09-02', acquisitionCost: 3_000_000, usefulLifeMonths: 36, residualValue: 0 };
const dep = buildDepreciationSchedule(mesin, ['2026-09', '2026-10']);
assert.equal(dep.monthlyDepreciation, Math.round((3_000_000 / 36) * 100) / 100);
assert.equal(dep.schedule.length, 2);
assert.equal(dep.fullyDepreciated, false);
assert.equal(totalMonthlyDepreciation([mesin]), dep.monthlyDepreciation);

// ── 5) PAJAK (PPN 11% & PPh Final UMKM 0,5%) ────────────────────────────────
const ppn = calculatePpn(1_000_000, 11);
assert.equal(ppn.ppn, 110_000);
assert.equal(ppn.totalTermasukPpn, 1_110_000);
const dppMundur = extractPpnFromGrossPrice(1_110_000, 11);
assert.equal(dppMundur.dpp, 1_000_000);
const pph = calculatePphFinalUmkm(50_000_000, 0.5);
assert.equal(pph.pphTerutang, 250_000);
const taxSummary = summarizeMonthlyTax('2026-09', 110_000, 40_000, 250_000);
assert.equal(taxSummary.ppnKurangBayar, 70_000);
assert.equal(taxSummary.totalKewajibanPajak, 320_000);

// ── 6) TUTUP BUKU (period lock + jurnal penutup) ────────────────────────────
const locks = [{ period: '2026-08', clientId: 'c1', lockedAt: '2026-09-05T00:00:00Z', lockedBy: 'admin' }];
assert.equal(isPeriodLocked('2026-08', 'c1', locks), true);
assert.throws(() => assertPeriodNotLocked('2026-08', 'c1', locks), /sudah ditutup/);
assertPeriodNotLocked('2026-09', 'c1', locks); // periode berjalan masih terbuka, tidak boleh throw

const closing = buildClosingEntry({
  clientId: 'c1',
  period: '2026-09',
  labaBersih: 700_000,
  retainedEarningsAccountId: byCode['3900'].id,
  nominalAccountBalances: [
    { accountId: penjualan, balance: -2_000_000 }, // saldo mentah revenue = debit-credit = -2jt
    { accountId: hpp, balance: 800_000 },
    { accountId: gaji, balance: 500_000 },
  ],
  entryId: 'close-2026-09',
  entryDate: '2026-09-30',
});
const totalDebitClosing = closing.closingEntry.lines.reduce((s, l) => s + l.debit, 0);
const totalCreditClosing = closing.closingEntry.lines.reduce((s, l) => s + l.credit, 0);
assert.equal(totalDebitClosing, totalCreditClosing, 'jurnal penutup itu sendiri harus balance (debit = kredit)');
assert.equal(closing.labaBersihDipindahkan, 700_000);

// ── 7) INFERENSI SUB-TYPE TANPA MIGRATION (untuk data yang sudah ada di Supabase) ──
// trace_accounts di Supabase TIDAK punya kolom sub_type. inferAccountSubType harus
// menebak dengan benar 100% dari 28 akun standar hanya dari kode+tipe akun saja.
for (const a of accounts) {
  assert.equal(inferAccountSubType(a), a.subType, `salah tebak untuk akun ${a.code} ${a.name}`);
}
// Akun custom di luar pola kode standar tetap harus jatuh ke fallback yang masuk akal
// berdasarkan account_type, bukan hilang/undefined.
assert.equal(inferAccountSubType({ code: '9001', type: 'asset' }), 'aset_lancar');
assert.equal(inferAccountSubType({ code: '9002', type: 'liability' }), 'liabilitas_lancar');
const plainAccountsFromDb = accounts.map(({ subType, ...rest }) => rest); // simulasi row dari DB (tanpa subType)
const rebuilt = withInferredSubTypes(plainAccountsFromDb);
assert.deepEqual(rebuilt.map(a => a.subType), accounts.map(a => a.subType));

console.log('accounting addon (neraca, arus kas, piutang/utang, aset tetap, pajak, tutup buku, sub-type inference) v72: PASS');
