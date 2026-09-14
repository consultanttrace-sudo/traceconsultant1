import assert from 'node:assert/strict';
import { buildIncomeStatement } from '../dist/core/financeStatement.js';

const records = [
  { id:'p1', period:'2026-08', amount:40000000, category:'revenue', accountLabel:'Penjualan Produk 1', statementSection:'pendapatan_usaha' },
  { id:'p2', period:'2026-08', amount:18000000, category:'revenue', accountLabel:'Penjualan Produk 3', statementSection:'pendapatan_usaha' },
  { id:'d1', period:'2026-08', amount:300000, category:'revenue', accountLabel:'Potongan Penjualan', statementSection:'pendapatan_usaha' },
  { id:'b1', period:'2026-08', amount:27000000, category:'cogs', accountLabel:'Biaya Bahan Baku', statementSection:'biaya_produksi' },
  { id:'b2', period:'2026-08', amount:2400000, category:'cogs', accountLabel:'Kerusakan Material', statementSection:'biaya_usaha_lain' },
  { id:'o1', period:'2026-08', amount:4000000, category:'labor', accountLabel:'Gaji Direksi dan Karyawan', statementSection:'biaya_operasional' },
  { id:'o2', period:'2026-08', amount:3000000, category:'opex', accountLabel:'Listrik, Air, dan Telpon', statementSection:'biaya_operasional' },
  { id:'n1', period:'2026-08', amount:3052083, category:'opex', accountLabel:'Penyusutan Kendaraan', statementSection:'biaya_non_operasional' },
  { id:'pl1', period:'2026-08', amount:10000000, category:'revenue', accountLabel:'Hasil Sewa', statementSection:'pendapatan_lain' },
  { id:'legacy1', period:'2026-08', amount:5000000, category:'opex' }, // no statementSection: pre-migration flat entry
];

const stmt = buildIncomeStatement(records, '2026-08');
assert.equal(stmt.pendapatanUsaha.total, 40000000 + 18000000 + 300000);
assert.equal(stmt.pendapatanUsaha.lines.length, 3);
assert.equal(stmt.totalBiayaAtasPendapatan, 27000000 + 2400000);
assert.equal(stmt.labaKotor, stmt.pendapatanUsaha.total - stmt.totalBiayaAtasPendapatan);
assert.equal(stmt.totalPengeluaranOperasional, 4000000 + 3000000 + 3052083);
assert.equal(stmt.labaOperasi, stmt.labaKotor - stmt.totalPengeluaranOperasional);
assert.equal(stmt.pendapatanLain.total, 10000000);
assert.equal(stmt.labaBersih, stmt.labaOperasi + 10000000 - 0);
assert.equal(stmt.unclassified.length, 1);
assert.equal(stmt.unclassified[0].amount, 5000000);

// A period with no records at all still returns a fully-shaped, zeroed statement
// rather than throwing — reports must never crash on an empty period.
const empty = buildIncomeStatement([], '2099-01');
assert.equal(empty.labaBersih, 0);
assert.equal(empty.pendapatanUsaha.lines.length, 0);

console.log('PASS finance statement assertions');
