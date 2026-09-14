import assert from 'node:assert/strict';
import {buildTrialBalance,calculateRecipeCogs,buildProfitChain} from '../dist/core/accounting.js';
const accounts=[{id:'cash',clientId:'c1',code:'1000',name:'Cash',type:'asset',active:true},{id:'rev',clientId:'c1',code:'4000',name:'Revenue',type:'revenue',active:true}];
const entries=[{id:'e1',clientId:'c1',date:'2026-09-01',memo:'sale',source:'system',lines:[{accountId:'cash',debit:100,credit:0},{accountId:'rev',debit:0,credit:100}]}];
const tb=buildTrialBalance(accounts,entries); assert.equal(tb.balanced,true); assert.equal(tb.totalDebit,100); assert.equal(tb.totalCredit,100);
const cogs=calculateRecipeCogs([{productId:'p1',qty:10,components:[{itemId:'i1',qtyPerSale:0.2,unitCost:5000},{itemId:'i2',qtyPerSale:1,unitCost:1000}]}]); assert.equal(cogs[0].cogs,20000);
assert.equal(buildProfitChain({revenue:100,cogs:40,labor:20,opex:10}).operatingProfit,30);
assert.equal(buildProfitChain({revenue:100,cogs:null,labor:20,opex:10}).operatingProfit,null);
console.log('accounting v72: PASS');
