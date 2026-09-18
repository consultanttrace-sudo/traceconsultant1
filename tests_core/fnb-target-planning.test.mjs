import assert from 'node:assert/strict';
import { calculateFnbTargetPlan } from '../dist/core/fnbTargetPlanning.js';
const r=calculateFnbTargetPlan({seats:40,turnsPerDay:2.5,occupancyPct:70,avgTicket:50000,operatingDays:30,fixedCosts:30000000,variableCostPct:40,desiredProfit:20000000});
assert.equal(r.seatCapacityDaily,70); assert.equal(r.seatRevenueMonthly,105000000); assert.equal(r.breakEvenRevenue,50000000); assert.ok(Math.abs(r.profitTargetRevenue-83333333.33333333)<0.01); assert.ok(r.targetRevenue>0); assert.ok(r.capacityRevenueMonthly>=r.targetRevenue);
console.log('fnb-target-planning PASS');
