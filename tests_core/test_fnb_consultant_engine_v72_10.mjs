import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app/main.tsx',import.meta.url),'utf8')
  +fs.readFileSync(new URL('../src/app/views/InventoryView.tsx',import.meta.url),'utf8')
  +fs.readFileSync(new URL('../src/app/views/FnbTargetPlanner.tsx',import.meta.url),'utf8'); // main.tsx dipecah 2026-09-17; 3 string RPC pindah ke InventoryView, 'Labor Capacity' ke FnbTargetPlanner
const sql=fs.readFileSync(new URL('../supabase/migrations/040_fnb_operational_manual_crud.sql',import.meta.url),'utf8');
for (const x of ['Inventory & Recipe','trace_create_inventory_item','trace_create_inventory_recipe','trace_create_inventory_movement','Target & Kapasitas','Labor Capacity']) if(!app.includes(x)) throw new Error('missing UI contract: '+x);
for (const x of ['trace_create_inventory_item','trace_update_inventory_item','trace_create_inventory_recipe','trace_delete_inventory_recipe','trace_create_inventory_movement']) if(!sql.includes(x)) throw new Error('missing RPC: '+x);
console.log('fnb consultant engine v72.10 static contract PASS');
