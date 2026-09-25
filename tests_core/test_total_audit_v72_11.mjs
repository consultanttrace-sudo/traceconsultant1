import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=process.cwd();
const pkg=JSON.parse(fs.readFileSync(`${root}/package.json`,'utf8'));
const lock=JSON.parse(fs.readFileSync(`${root}/package-lock.json`,'utf8'));
assert.equal(lock.packages[''].version,pkg.version,'lock root version must match package');
for(const dep of Object.keys(pkg.dependencies)) assert.ok(lock.packages[''].dependencies?.[dep],`lock root missing dependency ${dep}`);
const views=['FnbTargetPlanner','InventoryView','FinanceEntry','AccountingView','SalesView','DataIntake','AcquisitionView','BusinessHealthView','InternalDiagnosisView'];
for(const required of views){
  const src=fs.readFileSync(`${root}/src/app/views/${required}.tsx`,'utf8');
  assert.ok(src.includes(`function ${required}`),`${required} missing its exported component`);
}
const fnbTarget=fs.readFileSync(`${root}/src/app/views/FnbTargetPlanner.tsx`,'utf8');
assert.ok(fnbTarget.includes('loadProductionEvidence'),'Target Planner must read production evidence');
const inventory=fs.readFileSync(`${root}/src/app/views/InventoryView.tsx`,'utf8');
assert.ok(inventory.includes('trace_update_inventory_item'),'Inventory edit must be wired to backend RPC');
const acq=fs.readFileSync(`${root}/react-app/public/acquisition/index.html`,'utf8');
assert.ok(acq.includes("fetch('/api/ai-chat'"),'acquisition AI must use server proxy');
assert.ok(!acq.includes("throw new Error('AI provider not configured in browser-safe V1')"),'legacy dead AI stub must be gone from active acquisition app');
assert.ok(fs.existsSync(`${root}/supabase/migrations/039_fnb_target_capacity_planner.sql`));
assert.ok(fs.existsSync(`${root}/supabase/migrations/040_fnb_operational_manual_crud.sql`));
console.log('v72.11 total audit contract: PASS');
