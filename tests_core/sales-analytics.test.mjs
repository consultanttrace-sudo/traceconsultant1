import assert from 'node:assert/strict';
import { buildSalesDashboard } from '../dist/core/salesAnalytics.js';

const lines = [
  { id:'1', productName:'Lunch Package 1', menuCategory:'Black Coffee', qty:2, unitPrice:50000, channel:'shopeefood', outletId:'Mal Jaknote', soldAt:'2026-08-05T05:30:00Z' },
  { id:'2', productName:'Lunch Package 1', menuCategory:'Black Coffee', qty:1, unitPrice:50000, channel:'gofood', outletId:'Mal Jaknote', soldAt:'2026-08-05T06:15:00Z' },
  { id:'3', productName:'Breakfast Package 2', menuCategory:'Milk Coffee', qty:1, unitPrice:35000, channel:'dine_in', outletId:'Stasiun KA', soldAt:'2026-08-06T02:00:00Z' },
];
const dash = buildSalesDashboard(lines);
assert.equal(dash.totalRevenue, 100000 + 50000 + 35000);
assert.equal(dash.topProducts[0].label, 'Lunch Package 1');
assert.equal(dash.topProducts[0].value, 150000);
assert.equal(dash.topCategories[0].label, 'Black Coffee');
assert.equal(dash.topChannels.find(c=>c.label==='ShopeeFood').value, 100000);
assert.equal(dash.monthlyRevenue.length, 1);
assert.equal(dash.monthlyRevenue[0].period, '2026-08');

const empty = buildSalesDashboard([]);
assert.equal(empty.totalRevenue, 0);
assert.equal(empty.topProducts.length, 0);

console.log('PASS sales analytics assertions');
