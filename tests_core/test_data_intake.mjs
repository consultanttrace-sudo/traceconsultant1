import assert from 'node:assert/strict';
import { aggregateDelimitedRows, applyManualCompletion, buildIntakeResult, calculateAvailableFinance, detectSourceType, findMappedField, parseAmount } from '../dist/core/dataIntake.js';
assert.equal(detectSourceType('laporan.xlsx'), 'xlsx');
assert.equal(detectSourceType('laporan.pdf'), 'pdf');
assert.equal(parseAmount('Rp 125.400.000'), 125400000);
assert.equal(findMappedField(['Tanggal','Penjualan Bersih','HPP'], 'revenue'), 1);
const base = buildIntakeResult({ businessName:'Coffee ABC', period:'2026-08', revenue:125400000, cogs:42100000, labor:18500000, opex:27300000 });
const result = calculateAvailableFinance(base);
assert.equal(result.businessName.value, 'Coffee ABC');
assert.equal(result.missingLabels.includes('Outlet'), true);
assert.equal(result.missingLabels.length, 1);
assert.equal(result.fields.find(f => f.key === 'grossProfit')?.value, 83300000);
assert.equal(result.fields.find(f => f.key === 'operatingProfit')?.value, 37500000);
assert.equal(parseAmount('Rp 1.234,56'), 1234.56);
assert.equal(parseAmount('1,234.56'), 1234.56);
assert.equal(parseAmount('1.234'), 1234);
assert.equal(parseAmount('1234,5'), 1234.5);
const agg=aggregateDelimitedRows(['Nama Bisnis','Periode','Revenue','COGS'], [['Coffee A','2026-08','1000000','400000'],['Coffee A','2026-08','1500000','600000']]);
assert.equal(agg.revenue,2500000); assert.equal(agg.cogs,1000000); assert.equal(agg.rowCount,2);
const manual=applyManualCompletion(buildIntakeResult({businessName:'Coffee A',period:'2026-08',revenue:100}),{cogs:'40',labor:'10',opex:'20'});
assert.equal(manual.cogs.value,40); assert.equal(manual.fields.find(f=>f.key==='operatingProfit')?.value,30);

console.log('data intake core: PASS');
assert.equal(detectSourceType('laporan.ods'),'ods');
assert.equal(detectSourceType('laporan.docx'),'docx');
assert.equal(detectSourceType('laporan.txt'),'txt');
assert.equal(detectSourceType('laporan.json'),'json');
assert.equal(detectSourceType('foto.jpg'),'image');
console.log('extended intake format detection: PASS');

console.log('workbook cross-context merge rule covered by adapter contract');

const complete=buildIntakeResult({businessName:'B',outletName:'O',period:'2026-08',revenue:100,cogs:40,labor:10,opex:20});
const twice = calculateAvailableFinance(calculateAvailableFinance(complete));
assert.equal(twice.fields.filter(f=>f.key==='grossProfit').length,1);
assert.equal(twice.fields.filter(f=>f.key==='operatingProfit').length,1);
console.log('Data intake idempotent derived fields: PASS');

const multi=aggregateDelimitedRows(
  ['Nama Bisnis','Outlet','Periode','Revenue','COGS','Labor','OPEX'],
  [
    ['Coffee A','Outlet 1','2026-03-01','100','40','10','20'],
    ['Coffee A','Outlet 1','2026-04-01','200','80','20','30'],
    ['Coffee A','Outlet 1','2026-05-01','300','120','30','40']
  ]
);
assert.equal(multi.periodCount,3);
assert.deepEqual(multi.periods,['2026-03','2026-04','2026-05']);
assert.equal(multi.periodStart,'2026-03');
assert.equal(multi.periodEnd,'2026-05');
assert.equal(multi.period,'2026-03 → 2026-05');
assert.equal(multi.monthlyBreakdown.length,3);
assert.equal(multi.monthlyBreakdown[1].revenue,200);
console.log('multi-period detection + monthly breakdown: PASS');
