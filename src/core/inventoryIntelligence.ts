export interface InventoryMovement { id:string; itemId:string; outletId?:string; type:'purchase'|'sale_consumption'|'adjustment'|'waste'|'return'|'transfer'; qty:number; unitCost:number|null; occurredAt:string; }
export interface RecipeComponent { productId:string; itemId:string; qtyPerSale:number; }
export interface InventoryVariance { itemId:string; expectedQty:number|null; actualQty:number|null; varianceQty:number|null; variancePct:number|null; estimatedImpact:number|null; status:'NORMAL'|'WATCH'|'HIGH_VARIANCE'|'INSUFFICIENT_DATA'; evidenceIds:string[]; }
export function calculateInventoryVariance(movements:InventoryMovement[], recipes:RecipeComponent[], sales:Array<{productId:string;qty:number;id:string}>):InventoryVariance[]{
  const itemIds=[...new Set([...movements.map(m=>m.itemId),...recipes.map(r=>r.itemId)])];
  return itemIds.map(itemId=>{
    const comps=recipes.filter(r=>r.itemId===itemId); const expected=comps.length?comps.reduce((s,r)=>s+sales.filter(x=>x.productId===r.productId).reduce((q,x)=>q+x.qty,0)*r.qtyPerSale,0):null;
    const actual=movements.filter(m=>m.itemId===itemId).reduce((s,m)=>s+(m.type==='sale_consumption'||m.type==='waste'?m.qty:0),0);
    const relevant=movements.filter(m=>m.itemId===itemId); const evidenceIds=relevant.map(m=>m.id);
    if(expected===null) return {itemId,expectedQty:null,actualQty:actual,varianceQty:null,variancePct:null,estimatedImpact:null,status:'INSUFFICIENT_DATA',evidenceIds};
    const variance=actual-expected; const pct=expected===0?null:Math.abs(variance/expected)*100; const cost=relevant.map(m=>m.unitCost).find((x):x is number=>typeof x==='number'&&Number.isFinite(x))??null; const impact=cost===null?null:Math.abs(variance)*cost;
    return {itemId,expectedQty:expected,actualQty:actual,varianceQty:variance,variancePct:pct,estimatedImpact:impact,status:pct===null?'INSUFFICIENT_DATA':pct>=20?'HIGH_VARIANCE':pct>=10?'WATCH':'NORMAL',evidenceIds};
  });
}
